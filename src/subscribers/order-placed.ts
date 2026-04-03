import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import createSubscriptionsFromOrderWorkflow from "../workflows/create-subscriptions-from-order"

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id

  try {
    await createSubscriptionsFromOrderWorkflow(container).run({
      input: { order_id: orderId },
    })
  } catch (err) {
    // Never throw from a subscriber — we don't want to affect the order on subscription failure
    const logger = container.resolve("logger")
    logger.error(
      `[order-placed] Failed to create subscriptions for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-placed-create-subscriptions",
  },
}
