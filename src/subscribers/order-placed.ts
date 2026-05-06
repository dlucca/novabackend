import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
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

  // Skip influencer sample orders — they don't have subscription line items
  // anyway, but short-circuit here so the workflow doesn't even run.
  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId) as any
    if (order?.metadata?.is_sample === true) {
      logger.info?.(
        `[order-placed] Order ${orderId} is an influencer sample — skipping subscription workflow`
      )
      return
    }
  } catch {
    // Best-effort guard — if the lookup fails, fall through to the normal flow.
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
