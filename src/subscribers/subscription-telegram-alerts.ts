import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendTelegramNotification } from "../lib/telegram-client"
import { mapPaymentFailedAlertToTelegramMessage } from "../lib/telegram-mappers"

type PaymentFailedData = {
  subscription_id: string
  reason: string
  error?: string
  customer_email: string
  customer_name: string
  amount?: number
}

export default async function subscriptionPaymentFailedTelegramAlert({
  event,
  container,
}: SubscriberArgs<PaymentFailedData>) {
  const logger = container.resolve("logger")
  const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
  if (!chatId) return

  try {
    await sendTelegramNotification(chatId, mapPaymentFailedAlertToTelegramMessage(event.data))
  } catch (err) {
    logger.warn(
      `[subscription-telegram-alerts] payment_failed Telegram alert failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.payment_failed",
  context: { subscriberId: "subscription-payment-failed-telegram" },
}
