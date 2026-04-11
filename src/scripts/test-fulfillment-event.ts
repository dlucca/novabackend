// src/scripts/test-fulfillment-event.ts
// Emits order.fulfillment_created to test the order-shipped-email subscriber.
// Usage: npx medusa exec ./src/scripts/test-fulfillment-event.ts

import { Modules } from "@medusajs/framework/utils"

export default async function testFulfillmentEvent({ container }: { container: any }) {
  const eventBus = container.resolve(Modules.EVENT_BUS)
  const orderService = container.resolve(Modules.ORDER)
  const logger = container.resolve("logger")

  // Get the most recent order with an email
  const orders = await orderService.listOrders({}, { take: 5, order: { created_at: "DESC" } }) as any[]
  const order = orders.find((o: any) => o.email)

  if (!order) {
    logger.error("No orders found with email — create an order first")
    return
  }

  // Get fulfillments for this order
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const fulfillments = await fulfillmentModule.listFulfillments({}, { relations: ["labels"] }) as any[]
  const fulfillment = fulfillments.find((f: any) => f.order_id === order.id) ?? fulfillments[0]

  logger.info(`Emitting order.fulfillment_created for order ${order.id} (${order.email})`)

  await eventBus.emit([{
    name: "order.fulfillment_created",
    data: {
      order_id: order.id,
      fulfillment_id: fulfillment?.id ?? "test-fulfillment-id",
    },
  }])

  logger.info("Event emitted. Waiting for subscriber to complete...")
  await new Promise((resolve) => setTimeout(resolve, 3000))
  logger.info("Done.")
}
