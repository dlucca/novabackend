import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendSlackNotification } from "../../../lib/slack-client"
import { mapRailwayEventToSlackBlocks, type RailwayWebhookPayload } from "../../../lib/slack-mappers"

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
      const webhookUrl = process.env.SLACK_BACKEND_WEBHOOK_URL
      if (!webhookUrl) {
        logger.warn("[railway-webhook] SLACK_BACKEND_WEBHOOK_URL not set — skipping notification")
        return
      }

      const blocks = mapRailwayEventToSlackBlocks(payload)
      if (!blocks) {
        // Intermediate status (BUILDING, DEPLOYING, etc.) — no alert needed
        return
      }

      await sendSlackNotification(webhookUrl, blocks)
      logger.info(
        `[railway-webhook] Slack notification sent for deployment status: ${payload.deployment?.status}`
      )
    } catch (err) {
      logger.error(
        `[railway-webhook] Failed to send Slack notification: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  })
}
