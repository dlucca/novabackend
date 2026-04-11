// src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
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
      `[envia-create-fulfillment] Passing labels to Medusa — tracking_number: "${shipment.trackingNumber}", tracking_url: "${shipment.trackUrl}", label_url: "${String(shipment.label ?? "").substring(0, 80)}"`
    )

    await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        location_id: locationId,
        items: order.items.map((item: any) => ({ id: item.id, quantity: item.quantity })),
        labels: [
          {
            tracking_number: shipment.trackingNumber,
            tracking_url: shipment.trackUrl,
            label_url: shipment.label,
          },
        ],
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

    return new StepResponse(null)
  }
)
