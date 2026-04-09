// src/workflows/envia-create-fulfillment/steps/generate-label.ts
//
// Quotes all configured carriers in parallel, sorts by price, and generates a
// shipping label with the cheapest carrier that succeeds. If the chosen carrier's
// generate endpoint rejects the request (carrier-specific validation quirk), it
// falls back to the next cheapest automatically.
//
// Compensation: if a downstream step fails after the label has been created,
// this step cancels the label in Envia to avoid an untracked phantom charge.

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { EnviaClient, type EnviaGenerateResult, type EnviaRateResult } from "../../../lib/envia-client"
import { mapAddress, buildShipmentRequest } from "../../../lib/envia-mappers"

// Carriers to quote in parallel. The Envia API requires one carrier per request.
// Validated against the Envia sandbox — add/remove based on your account's active carriers.
//
// Note: "estafeta" fails /ship/generate/ in the sandbox with "State code not founded"
// for all MX state codes. It may work correctly in production — the fallback loop
// handles the failure gracefully (falls back to the next cheapest carrier) so there
// is no downside to keeping it in the list.
const CARRIERS_TO_QUOTE = ["dhl", "fedex", "estafeta", "redpack", "ups"]

type CompensationData = {
  shipmentId: number
  carrier: string
  trackingNumber: string
} | null

export const generateEnviaLabelStep = createStep(
  "generate-envia-label",

  async ({ order }: { order: any }, { container }) => {
    const logger = container.resolve("logger")
    const client = new EnviaClient()
    const destination = mapAddress(order.shipping_address)
    const items = order.items ?? []

    // ── 1. Quote all carriers in parallel ────────────────────────────────────
    const rateSettled = await Promise.allSettled(
      CARRIERS_TO_QUOTE.map((carrier) =>
        client.getRate(buildShipmentRequest(destination, items, { carrier }))
      )
    )

    rateSettled.forEach((result, i) => {
      if (result.status === "rejected") {
        logger.warn(
          `[envia-create-fulfillment] Rate failed for "${CARRIERS_TO_QUOTE[i]}": ${
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          }`
        )
      }
    })

    const sortedRates = rateSettled
      .filter((r): r is PromiseFulfilledResult<EnviaRateResult> =>
        r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value)
      .sort((a, b) => parseFloat(a.totalPrice) - parseFloat(b.totalPrice))

    if (sortedRates.length === 0) {
      throw new Error(`No shipping rates available for order ${order.id}`)
    }

    // ── 2. Generate label — try cheapest first, fall back on 4xx ─────────────
    let shipment: EnviaGenerateResult | null = null

    for (const rate of sortedRates) {
      try {
        logger.info(
          `[envia-create-fulfillment] Trying ${rate.carrier}/${rate.service} at ${rate.totalPrice} ${rate.currency} for order ${order.id}`
        )
        shipment = await client.generateShipment(
          buildShipmentRequest(destination, items, { carrier: rate.carrier, service: rate.service })
        )
        logger.info(
          `[envia-create-fulfillment] Label generated — tracking: ${shipment.trackingNumber}, shipmentId: ${shipment.shipmentId}`
        )
        break
      } catch (err: any) {
        // Re-throw 5xx / network errors — let the workflow retry machinery handle them.
        // On 4xx (carrier validation issue), fall back to the next cheapest carrier.
        if (err.statusCode !== undefined && err.statusCode >= 500) throw err
        logger.warn(
          `[envia-create-fulfillment] Generate failed for "${rate.carrier}": ${err.message} — trying next carrier`
        )
      }
    }

    if (!shipment) {
      throw new Error(`All carriers failed label generation for order ${order.id}`)
    }

    const compensationData: CompensationData = {
      shipmentId: shipment.shipmentId,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    }

    return new StepResponse(shipment, compensationData)
  },

  // Compensation: cancel the Envia label if a downstream step (e.g. Medusa fulfillment
  // creation) fails. Best-effort — logs if cancellation itself fails so operators can
  // void the label manually in the Envia dashboard.
  async (compensationData: CompensationData, { container }) => {
    if (!compensationData) return
    const logger = container.resolve("logger")
    try {
      const client = new EnviaClient()
      await client.cancelShipment(compensationData)
      logger.info(
        `[envia-create-fulfillment] Envia shipment ${compensationData.shipmentId} cancelled (compensation)`
      )
    } catch (err: any) {
      logger.error(
        `[envia-create-fulfillment] Could not cancel Envia shipment ${compensationData.shipmentId}: ${
          err.message
        } — manual void required in Envia dashboard`
      )
    }
  }
)
