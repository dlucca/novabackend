import { Modules } from "@medusajs/framework/utils"
import { mapFulfillmentToTelegramMessage } from "../lib/telegram-mappers"
import { sendTelegramNotification } from "../lib/telegram-client"

export default async function ({ container }: { container: any }) {
  const logger = container.resolve("logger")
  const orderService = container.resolve(Modules.ORDER)

  // Get the most recent order
  const [orders] = await orderService.listAndCountOrders(
    {},
    { take: 1, order: { created_at: "DESC" } }
  )

  if (!orders.length) {
    logger.warn("[test-telegram] No orders found in database")
    return
  }

  const orderId = orders[0].id
  const order = await orderService.retrieveOrder(orderId, {
    relations: ["items", "shipping_address"],
  })

  logger.info(`[test-telegram] Sending Telegram notification for order #${(order as any).display_id}`)

  const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
  if (!chatId) {
    logger.error("[test-telegram] TELEGRAM_ORDERS_CHAT_ID not set in .env")
    return
  }

  const labelUrl = process.env.TEST_LABEL_URL ?? "https://envia.com/label/test-placeholder.pdf"
  const message = mapFulfillmentToTelegramMessage(order, labelUrl)
  await sendTelegramNotification(chatId, message)

  logger.info("[test-telegram] Done — check your Telegram group")
}
