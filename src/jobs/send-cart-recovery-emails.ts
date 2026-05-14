import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const CONCURRENCY = 5
// Send recovery emails for carts abandoned at least 11 hours ago, but no
// older than 24 hours — older than that and the user has clearly moved on.
const ABANDONED_AFTER_HOURS = 11
const MAX_AGE_HOURS = 24

export default async function sendCartRecoveryEmailsJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const eventBus = container.resolve(Modules.EVENT_BUS)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("[CartRecovery] Starting cart recovery email job...")

  const now = new Date()
  const lowerBound = new Date(now.getTime() - MAX_AGE_HOURS * 3600 * 1000)
  const upperBound = new Date(now.getTime() - ABANDONED_AFTER_HOURS * 3600 * 1000)

  // Find carts abandoned in the [11h, 24h] window that:
  //  - have an email captured at checkout
  //  - have at least one line item
  //  - have not been completed (no order yet)
  //  - have not received a recovery email already (metadata flag)
  let candidates: Array<{
    id: string
    email: string | null
    completed_at: string | null
    metadata: Record<string, unknown> | null
    items_count?: number
  }> = []
  try {
    const { data } = await query.graph({
      entity: "cart",
      filters: {
        completed_at: null,
        // Medusa's mikro-orm filters accept $gte / $lte
        created_at: { $gte: lowerBound, $lte: upperBound } as any,
      },
      fields: ["id", "email", "completed_at", "metadata", "items.id"],
    })
    candidates = (data ?? []).map((c: any) => ({
      id: c.id,
      email: c.email,
      completed_at: c.completed_at,
      metadata: c.metadata ?? null,
      items_count: Array.isArray(c.items) ? c.items.length : 0,
    }))
  } catch (err) {
    logger.error(
      `[CartRecovery] Failed to query carts: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return
  }

  // Apply the rest of the filters in memory — JSON filters via query.graph
  // are awkward and the candidate set is small.
  const eligible = candidates.filter((c) => {
    if (!c.email) return false
    if ((c.items_count ?? 0) === 0) return false
    if (c.completed_at) return false
    if (c.metadata?.recovery_email_sent === true) return false
    // Skip carts created by the pre-checkout smoke. They have a fake email
    // and would just produce Resend bounces if recovery fires on them.
    if (c.metadata?.smoke_test === true) return false
    return true
  })

  logger.info(
    `[CartRecovery] ${candidates.length} cart(s) in window, ${eligible.length} eligible for email`
  )

  if (eligible.length === 0) return

  let queued = 0
  let failed = 0

  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    const chunk = eligible.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(async (cart) => {
        await eventBus.emit([
          {
            name: "cart.recovery_email_due",
            data: { cart_id: cart.id, customer_email: cart.email as string },
          },
        ])
      })
    )
    for (const r of results) {
      if (r.status === "fulfilled") queued++
      else failed++
    }
  }

  logger.info(
    `[CartRecovery] Done. Queued: ${queued} | Failed: ${failed}`
  )
}

export const config = {
  name: "send-cart-recovery-emails",
  // Every hour at :05 — small offset so we don't collide with other top-of-hour jobs.
  schedule: "5 * * * *",
}
