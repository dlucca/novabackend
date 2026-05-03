import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendSlackNotification } from "../lib/slack-client"
import { mapPaymentCapturedToSlackBlocks } from "../lib/slack-mappers"

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "total",
  "currency_code",
  "created_at",
  "customer.first_name",
  "customer.last_name",
  "customer.email",
  "shipping_address.first_name",
  "items.id",
  "items.title",
  "items.quantity",
  "items.metadata",
]

export default async function orderPaymentCapturedSlackAlert({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  // Prefer a dedicated payments webhook so successful charges go to a sales
  // channel; fall back to the backend webhook for backwards compatibility.
  const webhookUrl =
    process.env.SLACK_PAYMENTS_WEBHOOK_URL ??
    process.env.SLACK_BACKEND_WEBHOOK_URL
  if (!webhookUrl) return

  const orderId = event.data.id
  if (!orderId) return

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ORDER_FIELDS,
    })
    const order = orders?.[0]
    if (!order) {
      logger.warn(`[order-payment-captured-slack] Order ${orderId} not found`)
      return
    }

    await sendSlackNotification(webhookUrl, mapPaymentCapturedToSlackBlocks(order))
  } catch (err) {
    logger.warn(
      `[order-payment-captured-slack] Slack alert failed for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: { subscriberId: "order-payment-captured-slack" },
}
