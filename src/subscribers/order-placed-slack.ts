import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { mapOrderToSlackBlocks } from "../lib/slack-mappers"
import { sendSlackNotification } from "../lib/slack-client"

export default async function orderPlacedSlackHandler({
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

  const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL
  if (!webhookUrl) {
    logger.warn(
      "[order-placed-slack] SLACK_ORDERS_WEBHOOK_URL not configured — skipping notification"
    )
    return
  }

  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = (await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    })) as any

    const blocks = mapOrderToSlackBlocks(order)
    await sendSlackNotification(webhookUrl, blocks)

    logger.info(
      `[order-placed-slack] Notificación enviada para orden #${order.display_id ?? orderId}`
    )
  } catch (err) {
    logger.error(
      `[order-placed-slack] Failed to notify Slack for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-placed-slack-notification",
  },
}
