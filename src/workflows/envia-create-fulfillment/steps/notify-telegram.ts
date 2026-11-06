// src/workflows/envia-create-fulfillment/steps/notify-telegram.ts

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { mapFulfillmentToTelegramMessage } from "../../../lib/telegram-mappers"
import { sendTelegramNotification } from "../../../lib/telegram-client"

export const notifyTelegramStep = createStep(
  "notify-telegram",
  async (
    {
      order,
      labelUrl,
      trackingNumber,
      carrier,
    }: {
      order: any
      labelUrl: string
      trackingNumber?: string
      carrier?: string
    },
    { container }
  ) => {
    const logger = container.resolve("logger")
    const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID

    if (!chatId) {
      logger.warn(
        "[envia-create-fulfillment] TELEGRAM_ORDERS_CHAT_ID not configured — skipping Telegram notification"
      )
      return new StepResponse(null)
    }

    try {
      const message = mapFulfillmentToTelegramMessage(order, labelUrl, { trackingNumber, carrier })
      await sendTelegramNotification(chatId, message)
      logger.info(
        `[envia-create-fulfillment] Telegram notification sent for order #${order.display_id ?? order.id}`
      )
    } catch (err) {
      logger.error(
        `[envia-create-fulfillment] Telegram notification failed for order ${order.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    return new StepResponse(null)
  }
)
