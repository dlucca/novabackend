// src/lib/telegram-client.ts

/**
 * Sends a message to a Telegram chat (group) via the Bot API.
 *
 * One bot (TELEGRAM_BOT_TOKEN) can post to many groups; the target group is
 * identified by its numeric chat_id. Messages use HTML parse mode, so callers
 * must HTML-escape any user-provided text (see telegram-mappers.ts).
 */
export async function sendTelegramNotification(
  chatId: string,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured")
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.text()
      if (body) detail = body
    } catch {
      /* ignore */
    }
    throw new Error(`Telegram sendMessage failed: ${response.status} ${detail}`)
  }
}
