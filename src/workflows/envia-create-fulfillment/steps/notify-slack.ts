// src/workflows/envia-create-fulfillment/steps/notify-slack.ts

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { mapFulfillmentToSlackBlocks } from "../../../lib/slack-mappers"
import { sendSlackNotification } from "../../../lib/slack-client"

export const notifySlackStep = createStep(
  "notify-slack",
  async ({ order, labelUrl }: { order: any; labelUrl: string }, { container }) => {
    const logger = container.resolve("logger")
    const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL

    if (!webhookUrl) {
      logger.warn(
        "[envia-create-fulfillment] SLACK_ORDERS_WEBHOOK_URL not configured — skipping Slack notification"
      )
      return new StepResponse(null)
    }

    try {
      const blocks = mapFulfillmentToSlackBlocks(order, labelUrl)
      await sendSlackNotification(webhookUrl, blocks)
      logger.info(
        `[envia-create-fulfillment] Slack notification sent for order #${order.display_id ?? order.id}`
      )
    } catch (err) {
      logger.error(
        `[envia-create-fulfillment] Slack notification failed for order ${order.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    return new StepResponse(null)
  }
)
