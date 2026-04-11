// src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { createOrderFulfillmentWorkflow, createShipmentWorkflow } from "@medusajs/medusa/core-flows"
import type { EnviaGenerateResult } from "../../../lib/envia-client"

export const createMedusaFulfillmentStep = createStep(
  "create-medusa-fulfillment",
  async ({ order, shipment }: { order: any; shipment: EnviaGenerateResult }, { container }) => {
    const logger = container.resolve("logger")
    const locationId = process.env.MEDUSA_WAREHOUSE_LOCATION_ID
    if (!locationId) {
      throw new Error(
        "MEDUSA_WAREHOUSE_LOCATION_ID is not set — cannot register fulfillment in Medusa"
      )
    }

    logger.info(
      `[envia-create-fulfillment] Creating fulfillment — tracking: "${shipment.trackingNumber}", carrier: "${shipment.carrier}"`
    )

    // Step 1: Create the fulfillment with Envia metadata (no labels yet)
    const { result: fulfillment } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        location_id: locationId,
        items: order.items.map((item: any) => ({ id: item.id, quantity: item.quantity })),
        metadata: {
          order_id: order.id,
          envia_shipment_id: String(shipment.shipmentId),
          envia_track_url: shipment.trackUrl,
          envia_label_url: shipment.label,
          carrier: shipment.carrier,
          service: shipment.service,
          envia_carrier_cost: String(shipment.totalPrice),
          envia_currency: shipment.currency,
        },
      },
    })

    logger.info(
      `[envia-create-fulfillment] Fulfillment created: ${fulfillment.id} — marking as shipped`
    )

    // Step 2: Mark as shipped with tracking labels.
    // This sets shipped_at, changes order status to "Fulfilled", and persists
    // the tracking number + label URL so the admin shows them natively.
    await createShipmentWorkflow(container).run({
      input: {
        id: fulfillment.id,
        labels: [
          {
            tracking_number: shipment.trackingNumber,
            tracking_url: shipment.trackUrl,
            label_url: shipment.label,
          },
        ],
      },
    })

    logger.info(
      `[envia-create-fulfillment] Shipment registered — fulfillment ${fulfillment.id} marked as shipped`
    )

    return new StepResponse(fulfillment.id)
  }
)
