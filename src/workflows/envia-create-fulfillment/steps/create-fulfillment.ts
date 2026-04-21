// src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { createOrderFulfillmentWorkflow, createShipmentWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import type { EnviaGenerateResult } from "../../../lib/envia-client"
import { getRedisClient, TRACKING_KEY_PREFIX, TRACKING_KEY_TTL_SECONDS } from "../../../lib/redis"
import { buildOrderMetadataUpdate } from "./build-order-metadata"

export const createMedusaFulfillmentStep = createStep(
  "create-medusa-fulfillment",
  async (
    {
      order,
      shipment,
      deliveryEstimate,
      quotedCarrierCost,
    }: { order: any; shipment: EnviaGenerateResult; deliveryEstimate: string; quotedCarrierCost: string },
    { container }
  ) => {
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

    // Step 1: Create the fulfillment record with Envia metadata
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

    logger.info(
      `[envia-create-fulfillment] Fulfillment ${fulfillment.id} created — registering shipment labels`
    )

    // Step 2: Register the Envia label as a shipment so the admin shows tracking number
    // and label PDF link. "Shipped" in Medusa = label created and ready for pickup.
    // The customer "en camino" email is sent later, when Envia webhook fires "in_transit"
    // (i.e. the carrier has physically collected the package).
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
      `[envia-create-fulfillment] Shipment registered — fulfillment ${fulfillment.id} visible in admin with tracking`
    )

    // Step 3: Write envia_* keys onto order.metadata (non-blocking)
    try {
      const orderService = container.resolve(Modules.ORDER)
      await (orderService as any).updateOrders(order.id, {
        metadata: buildOrderMetadataUpdate(order.metadata, shipment, deliveryEstimate, quotedCarrierCost),
      })
      logger.info(
        `[envia-create-fulfillment] order.metadata updated with envia_eta="${deliveryEstimate}"`
      )
    } catch (updErr) {
      logger.warn(
        `[envia-create-fulfillment] Failed to update order.metadata — label created, but order lacks envia_eta for emails: ${
          updErr instanceof Error ? updErr.message : String(updErr)
        }`
      )
    }

    return new StepResponse(fulfillment.id)
  }
)
