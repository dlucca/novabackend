import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

const CONCURRENCY = 5

export default async function sendUpcomingChargeRemindersJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
  const orderService = container.resolve(Modules.ORDER)
  const customerService = container.resolve(Modules.CUSTOMER)
  const eventBus = container.resolve(Modules.EVENT_BUS)

  logger.info("[UpcomingChargeReminders] Starting job...")

  // Target window: subscriptions whose next_billing_date falls exactly 3 days from now
  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setUTCDate(windowStart.getUTCDate() + 3)
  windowStart.setUTCHours(0, 0, 0, 0)

  const windowEnd = new Date(windowStart)
  windowEnd.setUTCHours(23, 59, 59, 999)

  let dueSubscriptions: any[]
  try {
    dueSubscriptions = await subscriptionService.listSubscriptions({
      status: "active",
      next_billing_date: { $gte: windowStart, $lte: windowEnd },
    })
  } catch (err) {
    logger.error(
      `[UpcomingChargeReminders] Failed to list subscriptions: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return
  }

  logger.info(
    `[UpcomingChargeReminders] Found ${dueSubscriptions.length} subscription(s) due in 3 days`
  )

  let sent = 0
  let failed = 0

  for (let i = 0; i < dueSubscriptions.length; i += CONCURRENCY) {
    const chunk = dueSubscriptions.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async (subscription): Promise<"sent" | "failed"> => {
        try {
          if (!subscription.original_order_id) {
            logger.warn(
              `[UpcomingChargeReminders] Subscription ${subscription.id} has no original_order_id — skipping`
            )
            return "failed"
          }

          // Resolve customer via original order (same pattern as process-billing step)
          const order = await orderService.retrieveOrder(
            subscription.original_order_id,
            { relations: [] }
          ) as any

          if (!order.customer_id) {
            logger.warn(
              `[UpcomingChargeReminders] Order ${order.id} has no customer_id — skipping`
            )
            return "failed"
          }

          let customer: any
          try {
            customer = await customerService.retrieveCustomer(order.customer_id)
          } catch {
            logger.warn(
              `[UpcomingChargeReminders] Customer ${order.customer_id} not found — skipping`
            )
            return "failed"
          }

          if (!customer.email) {
            logger.warn(
              `[UpcomingChargeReminders] Customer ${customer.id} has no email — skipping`
            )
            return "failed"
          }

          const customerName =
            `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || "Cliente"

          // Product title is stored in subscription metadata at creation time
          const productTitle =
            (subscription.metadata?.product_title as string) ?? "Suscripción Novapatch"

          const nextBillingDate = new Date(subscription.next_billing_date).toISOString()

          await eventBus.emit([{
            name: "subscription.upcoming_charge",
            data: {
              subscription_id: subscription.id,
              customer_email: customer.email,
              customer_name: customerName,
              next_billing_date: nextBillingDate,
              product_title: productTitle,
              interval_days: subscription.interval_days,
            },
          }])

          return "sent"
        } catch (err) {
          logger.error(
            `[UpcomingChargeReminders] Error processing subscription ${subscription.id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
          return "failed"
        }
      })
    )
    for (const result of results) {
      if (result.status === "fulfilled" && result.value === "sent") sent++
      else failed++
    }
  }

  logger.info(
    `[UpcomingChargeReminders] Done. Sent: ${sent} | Failed: ${failed}`
  )
}

export const config = {
  name: "send-upcoming-charge-reminders",
  // 06:05 UTC = 00:05 CST — runs just after the billing job at 06:00
  schedule: "5 6 * * *",
}
