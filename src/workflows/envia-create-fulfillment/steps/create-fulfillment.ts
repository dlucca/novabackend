// src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import type { EnviaGenerateResult } from "../../../lib/envia-client"
import { getRedisClient, TRACKING_KEY_PREFIX, TRACKING_KEY_TTL_SECONDS } from "../../../lib/redis"

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

    const { result: fulfillment } = await createOrderFulfillmentWorkflow(container).run({
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

    // Write tracking→fulfillmentId index to Redis for O(1) webhook lookup
    try {
      const redis = getRedisClient()
      if (redis) {
        await redis.set(
          `${TRACKING_KEY_PREFIX}${shipment.trackingNumber}`,
          fulfillment.id,
          "EX",
          TRACKING_KEY_TTL_SECONDS
        )
        logger.info(
          `[envia-create-fulfillment] Redis index written: ${TRACKING_KEY_PREFIX}${shipment.trackingNumber} → ${fulfillment.id}`
        )
      }
    } catch (redisErr) {
      // Non-fatal — webhook will fall back to full scan
      logger.warn(
        `[envia-create-fulfillment] Failed to write Redis tracking index: ${redisErr instanceof Error ? redisErr.message : String(redisErr)}`
      )
    }

    return new StepResponse(fulfillment.id)
  }
)
