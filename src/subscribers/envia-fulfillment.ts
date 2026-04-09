// src/subscribers/envia-fulfillment.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { EnviaClient, type EnviaRateResult } from "../lib/envia-client"
import { mapAddress, buildShipmentRequest } from "../lib/envia-mappers"

// Carriers to quote in parallel. The Envia API requires one carrier per request.
// Add/remove from this list based on carriers available in your Envia account.
const CARRIERS_TO_QUOTE = ["dhl", "fedex", "estafeta", "j&t", "99min"]

export default async function enviaFulfillmentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  // Guard: skip if Envia is not configured (e.g. local dev without sandbox token)
  if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
    logger.warn(`[envia-fulfillment] ENVIA_API_TOKEN or ENVIA_API_URL not set — skipping order ${orderId}`)
    return
  }

  try {
    // 1. Fetch the order with shipping address and items
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    }) as any

    if (!order) {
      logger.warn(`[envia-fulfillment] Order ${orderId} not found`)
      return
    }

    if (!order.shipping_address) {
      logger.warn(`[envia-fulfillment] Order ${orderId} has no shipping address — skipping`)
      return
    }

    const destination = mapAddress(order.shipping_address)
    const client = new EnviaClient()

    // 2. Quote each carrier in parallel (API requires one carrier per request)
    const rateResults = await Promise.all(
      CARRIERS_TO_QUOTE.map((carrier) =>
        client.getRate(buildShipmentRequest(destination, order.items ?? [], { carrier }))
      )
    )
    const rates = rateResults.filter((r): r is EnviaRateResult => r !== null)

    if (rates.length === 0) {
      logger.error(`[envia-fulfillment] No rates available for order ${orderId} — fulfillment skipped`)
      // RNF-01: do NOT cancel the order — it stays as `paid` without a fulfillment
      return
    }

    const cheapest = rates.reduce((best, rate) =>
      parseFloat(rate.totalPrice) < parseFloat(best.totalPrice) ? rate : best
    )

    logger.info(
      `[envia-fulfillment] Selected carrier ${cheapest.carrier} / ${cheapest.service} at ${cheapest.totalPrice} ${cheapest.currency} for order ${orderId}`
    )

    // 3. Generate the shipping label with the selected carrier + service
    const generateReq = buildShipmentRequest(destination, order.items ?? [], {
      carrier: cheapest.carrier,
      service: cheapest.service,
    })
    const shipment = await client.generateShipment(generateReq)

    logger.info(
      `[envia-fulfillment] Label generated — trackingNumber: ${shipment.trackingNumber}, shipmentId: ${shipment.shipmentId}`
    )

    // 4. Create a Medusa fulfillment for all items in the order
    const locationId = process.env.MEDUSA_WAREHOUSE_LOCATION_ID
    await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: orderId,
        location_id: locationId ?? "",
        items: (order.items ?? []).map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
        })),
        labels: [
          {
            tracking_number: shipment.trackingNumber,
            tracking_url: shipment.trackUrl,
            label_url: shipment.label,
          },
        ],
        metadata: {
          envia_shipment_id: String(shipment.shipmentId),
          envia_track_url: shipment.trackUrl,
          envia_label_url: shipment.label,
          carrier: shipment.carrier,
          service: shipment.service,
        },
      },
    })

    logger.info(
      `[envia-fulfillment] Fulfillment created for order ${orderId} with tracking ${shipment.trackingNumber}`
    )
  } catch (err) {
    // RNF-01: never throw — let the order stay paid; an operator can create the fulfillment manually
    logger.error(
      `[envia-fulfillment] Failed to create fulfillment for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: {
    subscriberId: "envia-fulfillment",
  },
}
