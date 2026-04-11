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
// Override via ENVIA_CARRIERS env var (comma-separated) to change without redeploying.
//
// Sandbox results (origin: Iztapalapa DIF → destination: Miguel Hidalgo DIF, 2026-04):
//   noventa9minutos  9.28 MXN  local_same_day   (same-day CDMX only — confirm coverage per order)
//   ups             11.60 MXN  saver             (unusually cheap in sandbox; verify in prod)
//   estafeta       228.52 MXN  express           (fails /ship/generate/ in sandbox — sandbox bug)
//   dhl            304.57 MXN  ground
//   fedex          564.92 MXN  ground
//
// Not included by default: redpack (not active in sandbox), paquetexpress (requires colonia field)
const DEFAULT_CARRIERS = ["noventa9minutos", "ups", "dhl", "fedex", "estafeta"]

function getCarriersToQuote(): string[] {
  const env = process.env.ENVIA_CARRIERS
  if (env) return env.split(",").map((c) => c.trim()).filter(Boolean)
  return DEFAULT_CARRIERS
}

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

    // Diagnostic: log env config so we can verify in Railway logs
    logger.info(
      `[envia-create-fulfillment] Config — ENVIA_API_URL="${process.env.ENVIA_API_URL ?? "NOT SET"}" token_set=${Boolean(process.env.ENVIA_API_TOKEN)}`
    )
    logger.info(
      `[envia-create-fulfillment] Destination: ${JSON.stringify(destination)}`
    )

    // ── 1. Quote all carriers in parallel ────────────────────────────────────
    const carriersToQuote = getCarriersToQuote()
    const rateSettled = await Promise.allSettled(
      carriersToQuote.map((carrier) =>
        client.getRate(buildShipmentRequest(destination, items, { carrier }))
      )
    )

    rateSettled.forEach((result, i) => {
      if (result.status === "rejected") {
        const err = result.reason
        const msg = err instanceof Error ? err.message : String(err)
        // Node fetch() TypeErrors carry a `cause` with the underlying OS error (ECONNREFUSED, etc.)
        const cause = err instanceof Error && (err as any).cause
          ? String((err as any).cause)
          : undefined
        logger.warn(
          `[envia-create-fulfillment] Rate failed for "${carriersToQuote[i]}": ${msg}${cause ? ` (cause: ${cause})` : ""}`
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
        // Log the raw response so we can verify field names match our type definition
        logger.info(
          `[envia-create-fulfillment] Label generated — raw response keys: ${Object.keys(shipment as any).join(", ")}`
        )
        logger.info(
          `[envia-create-fulfillment] Label generated — tracking: ${(shipment as any).trackingNumber ?? (shipment as any).tracking_number ?? "MISSING"}, shipmentId: ${(shipment as any).shipmentId ?? (shipment as any).shipment_id ?? "MISSING"}, label: ${String((shipment as any).label ?? (shipment as any).labelUrl ?? (shipment as any).label_url ?? "MISSING").substring(0, 80)}`
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
