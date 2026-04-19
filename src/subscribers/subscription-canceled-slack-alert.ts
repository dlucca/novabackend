import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendSlackNotification } from "../lib/slack-client"
import { mapSubscriptionCanceledToSlackBlocks } from "../lib/slack-mappers"

type CanceledData = {
  subscription_id: string
  previous_status: string
  interval_days?: number
}

export default async function subscriptionCanceledSlackAlert({
  event,
  container,
}: SubscriberArgs<CanceledData>) {
  const logger = container.resolve("logger")
  const webhookUrl = process.env.SLACK_BACKEND_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    await sendSlackNotification(webhookUrl, mapSubscriptionCanceledToSlackBlocks(event.data))
  } catch (err) {
    logger.warn(
      `[subscription-canceled-slack-alert] Slack alert failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.canceled",
  context: { subscriberId: "subscription-canceled-slack" },
}
