import { MedusaContainer } from "@medusajs/framework/types"
import processBillingCycleWorkflow from "../workflows/process-billing-cycle"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"
import { sendTelegramNotification } from "../lib/telegram-client"
import {
  mapBillingRunToTelegramMessage,
  mapBillingCriticalErrorToTelegramMessage,
  mapBillingPausedToTelegramMessage,
} from "../lib/telegram-mappers"

const CONCURRENCY = 5

export default async function processDailySubscriptionsJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

  // Kill switch: set BILLING_CRON_PAUSED=true in env to prevent any charges.
  // Use this when rolling out billing changes or if a bug is suspected — the
  // job logs and notifies Telegram but skips all charging.
  if (process.env.BILLING_CRON_PAUSED === "true") {
    logger.warn(
      "[ProcessDailySubscriptions] BILLING_CRON_PAUSED=true — skipping daily billing run"
    )
    const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
    if (chatId) {
      await sendTelegramNotification(chatId, mapBillingPausedToTelegramMessage()).catch((e) =>
        logger.warn(`[ProcessDailySubscriptions] Telegram pause notice failed: ${e.message}`)
      )
    }
    return
  }

  logger.info("[ProcessDailySubscriptions] Starting daily billing job...")

  const now = new Date()

  let dueSubscriptions: any[]
  try {
    // DB-level filter: only fetch active subscriptions that are actually due
    dueSubscriptions = await subscriptionService.listSubscriptions({
      status: "active",
      next_billing_date: { $lte: now },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[ProcessDailySubscriptions] Failed to list subscriptions: ${message}`)

    const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
    if (chatId) {
      await sendTelegramNotification(chatId, mapBillingCriticalErrorToTelegramMessage(message)).catch(
        (e) => logger.warn(`[ProcessDailySubscriptions] Telegram alert failed: ${e.message}`)
      )
    }
    return
  }

  logger.info(
    `[ProcessDailySubscriptions] Found ${dueSubscriptions.length} subscription(s) due for billing`
  )

  let succeeded = 0
  let failed = 0
  let skipped = 0

  // Process in parallel batches of CONCURRENCY to avoid overwhelming Openpay or the DB pool
  for (let i = 0; i < dueSubscriptions.length; i += CONCURRENCY) {
    const chunk = dueSubscriptions.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map((subscription) =>
        processBillingCycleWorkflow(container).run({
          input: { subscription_id: subscription.id },
        })
      )
    )

    for (const result of results) {
      if (result.status === "rejected") {
        failed++
        logger.error(
          `[ProcessDailySubscriptions] Unhandled error in billing batch: ${
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          }`
        )
      } else {
        const res = (result.value as any)?.result
        if (res?.skipped || res?.delayed) skipped++
        else if (res?.failed) failed++
        else succeeded++
      }
    }
  }

  logger.info(
    `[ProcessDailySubscriptions] Done. Succeeded: ${succeeded} | Failed: ${failed} | Skipped/Delayed: ${skipped}`
  )

  const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID
  if (chatId) {
    const date = now.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "America/Mexico_City",
    })
    await sendTelegramNotification(
      chatId,
      mapBillingRunToTelegramMessage({ succeeded, failed, skipped, total: dueSubscriptions.length, date })
    ).catch((e) => logger.warn(`[ProcessDailySubscriptions] Telegram summary failed: ${e.message}`))
  }
}

export const config = {
  name: "process-daily-subscriptions",
  // 06:00 UTC = midnight CST (Mexico City, UTC-6)
  schedule: "0 3 * * *",
}
