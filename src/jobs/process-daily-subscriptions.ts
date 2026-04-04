import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import processBillingCycleWorkflow from "../workflows/process-billing-cycle"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

export default async function processDailySubscriptionsJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

  logger.info("[ProcessDailySubscriptions] Starting daily billing job...")

  const now = new Date()

  let dueSubscriptions: any[]
  try {
    // Fetch all active subscriptions and filter by due date in JS.
    // Counts stay small in phase 1; replace with DB-level filter if needed.
    const all = await subscriptionService.listSubscriptions({ status: "active" })
    dueSubscriptions = all.filter(
      (s: any) => new Date(s.next_billing_date) <= now
    )
  } catch (err) {
    logger.error(
      `[ProcessDailySubscriptions] Failed to list subscriptions: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return
  }

  logger.info(
    `[ProcessDailySubscriptions] Found ${dueSubscriptions.length} subscription(s) due for billing`
  )

  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const subscription of dueSubscriptions) {
    try {
      const { result } = await processBillingCycleWorkflow(container).run({
        input: { subscription_id: subscription.id },
      })

      if ((result as any)?.skipped || (result as any)?.delayed) {
        skipped++
      } else if ((result as any)?.failed) {
        failed++
      } else {
        succeeded++
      }
    } catch (err) {
      failed++
      logger.error(
        `[ProcessDailySubscriptions] Unhandled error for subscription ${subscription.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  logger.info(
    `[ProcessDailySubscriptions] Done. Succeeded: ${succeeded} | Failed: ${failed} | Skipped/Delayed: ${skipped}`
  )
}

export const config = {
  name: "process-daily-subscriptions",
  // 06:00 UTC = midnight CST (Mexico City, UTC-6)
  schedule: "0 6 * * *",
}
