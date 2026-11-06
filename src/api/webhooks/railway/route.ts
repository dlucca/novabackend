import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendTelegramNotification } from "../../../lib/telegram-client"
import { mapRailwayEventToTelegramMessage, type RailwayWebhookPayload } from "../../../lib/telegram-mappers"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Validate shared secret
  const secret = req.query.secret as string | undefined
  const expectedSecret = process.env.RAILWAY_WEBHOOK_SECRET
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  // Respond immediately — Railway expects a fast 200
  res.status(200).json({ received: true })

  const logger = req.scope.resolve("logger")
  const payload = req.body as RailwayWebhookPayload

  setImmediate(async () => {
    try {
      const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
      if (!chatId) {
        logger.warn("[railway-webhook] TELEGRAM_ORDERS_CHAT_ID not set — skipping notification")
        return
      }

      const message = mapRailwayEventToTelegramMessage(payload)
      if (!message) {
        // Intermediate status (BUILDING, DEPLOYING, etc.) — no alert needed
        return
      }

      await sendTelegramNotification(chatId, message)
      logger.info(
        `[railway-webhook] Telegram notification sent for deployment status: ${payload.deployment?.status}`
      )
    } catch (err) {
      logger.error(
        `[railway-webhook] Failed to send Telegram notification: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  })
}
