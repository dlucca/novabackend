/**
 * Prints the chat_id of every Telegram chat/group your bot has recently seen.
 *
 * Steps:
 *   1. Create the bot with @BotFather and put the token in .env as
 *      TELEGRAM_BOT_TOKEN.
 *   2. Add the bot to your group(s).
 *   3. Send any message in each group (e.g. "hola").
 *   4. Run: npx medusa exec ./src/scripts/get-telegram-chat-id.ts
 *   5. Copy the id (groups look like -1001234567890) into .env.
 */
export default async function ({ container }: { container: any }) {
  const logger = container.resolve("logger")
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    logger.error("[get-chat-id] TELEGRAM_BOT_TOKEN not set in .env")
    return
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  const data = (await res.json()) as any

  if (!data.ok) {
    logger.error(`[get-chat-id] Telegram API error: ${JSON.stringify(data)}`)
    return
  }

  const seen = new Map<string, string>()
  for (const update of data.result ?? []) {
    const chat = update.message?.chat ?? update.channel_post?.chat
    if (chat) {
      const label = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? "—"
      seen.set(String(chat.id), `${label} (${chat.type})`)
    }
  }

  if (seen.size === 0) {
    logger.warn(
      "[get-chat-id] No chats found. Add the bot to the group and send a message there first, then re-run."
    )
    return
  }

  logger.info("[get-chat-id] Chats found:")
  for (const [id, label] of seen) {
    logger.info(`  chat_id=${id}  →  ${label}`)
  }
}
