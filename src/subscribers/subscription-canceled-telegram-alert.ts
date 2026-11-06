import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendTelegramNotification } from "../lib/telegram-client"
import { mapSubscriptionCanceledToTelegramMessage } from "../lib/telegram-mappers"

type CanceledData = {
  subscription_id: string
  previous_status: string
  interval_days?: number
}

export default async function subscriptionCanceledTelegramAlert({
  event,
  container,
}: SubscriberArgs<CanceledData>) {
  const logger = container.resolve("logger")
  const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
  if (!chatId) return

  try {
    await sendTelegramNotification(chatId, mapSubscriptionCanceledToTelegramMessage(event.data))
  } catch (err) {
    logger.warn(
      `[subscription-canceled-telegram-alert] Telegram alert failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.canceled",
  context: { subscriberId: "subscription-canceled-telegram" },
}
