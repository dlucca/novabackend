import type { SlackBlock } from "./slack-mappers"

export async function sendSlackNotification(
  webhookUrl: string,
  blocks: SlackBlock[]
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const text = await response.text()
      if (text) detail = text
    } catch { /* ignore */ }
    throw new Error(`Slack webhook failed: ${response.status} ${detail}`)
  }
}
