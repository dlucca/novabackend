import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendSlackNotification } from "../lib/slack-client"
import { mapPaymentFailedAlertToSlackBlocks } from "../lib/slack-mappers"

type PaymentFailedData = {
  subscription_id: string
  reason: string
  error?: string
  customer_email: string
  customer_name: string
  amount?: number
}

export default async function subscriptionPaymentFailedSlackAlert({
  event,
  container,
}: SubscriberArgs<PaymentFailedData>) {
  const logger = container.resolve("logger")
  const webhookUrl = process.env.SLACK_BACKEND_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    await sendSlackNotification(webhookUrl, mapPaymentFailedAlertToSlackBlocks(event.data))
  } catch (err) {
    logger.warn(
      `[subscription-slack-alerts] payment_failed Slack alert failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.payment_failed",
  context: { subscriberId: "subscription-payment-failed-slack" },
}
