import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendTelegramNotification } from "../lib/telegram-client"
import { mapPaymentCapturedToTelegramMessage } from "../lib/telegram-mappers"

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
  "metadata",
]

export default async function orderPaymentCapturedTelegramAlert({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
  if (!chatId) return

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
      logger.warn(`[order-payment-captured-telegram] Order ${orderId} not found`)
      return
    }

    await sendTelegramNotification(chatId, mapPaymentCapturedToTelegramMessage(order))
  } catch (err) {
    logger.warn(
      `[order-payment-captured-telegram] Telegram alert failed for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: { subscriberId: "order-payment-captured-telegram" },
}
