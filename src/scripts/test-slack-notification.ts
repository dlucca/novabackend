import { Modules } from "@medusajs/framework/utils"
import { mapOrderToSlackBlocks } from "../lib/slack-mappers"
import { sendSlackNotification } from "../lib/slack-client"

export default async function ({ container }: { container: any }) {
  const logger = container.resolve("logger")
  const orderService = container.resolve(Modules.ORDER)

  // Get the most recent order
  const [orders] = await orderService.listAndCountOrders(
    {},
    { take: 1, order: { created_at: "DESC" } }
  )

  if (!orders.length) {
    logger.warn("[test-slack] No orders found in database")
    return
  }

  const orderId = orders[0].id
  const order = await orderService.retrieveOrder(orderId, {
    relations: ["items", "shipping_address"],
  })

  logger.info(`[test-slack] Sending Slack notification for order #${(order as any).display_id}`)

  const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL
  if (!webhookUrl) {
    logger.error("[test-slack] SLACK_ORDERS_WEBHOOK_URL not set in .env")
    return
  }

  const blocks = mapOrderToSlackBlocks(order)
  await sendSlackNotification(webhookUrl, blocks)

  logger.info("[test-slack] Done — check your Slack channel")
}
