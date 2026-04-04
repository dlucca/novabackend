import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import createSubscriptionsFromOrderWorkflow from "../workflows/create-subscriptions-from-order"

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  let logger: any
  try {
    logger = container.resolve("logger")
  } catch {
    logger = console
  }

  try {
    await createSubscriptionsFromOrderWorkflow(container).run({
      input: { order_id: orderId },
    })
  } catch (err) {
    // Never throw from a subscriber — we don't want to affect the order on subscription failure
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    logger.error(`[order-placed] Failed to create subscriptions for order ${orderId}: ${msg}`)
    console.error(`[order-placed] Full error:`, err)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-placed-create-subscriptions",
  },
}
