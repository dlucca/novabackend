import type { SlackBlock } from "./slack-mappers"

export async function sendSlackNotification(blocks: SlackBlock[]): Promise<void> {
  const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error("SLACK_ORDERS_WEBHOOK_URL is not configured")
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  })

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`)
  }
}
