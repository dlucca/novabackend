import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  // Find the Medusa customer whose email matches the Clerk-authenticated user
  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    // No Medusa account exists yet for this Clerk user — no subscriptions
    res.json({ subscriptions: [] })
    return
  }

  const customerId = customers[0].id

  // Fetch subscriptions via the customer ↔ subscription remote link
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  try {
    const { data: result } = await query.graph({
      entity: "customer",
      filters: { id: customerId },
      fields: ["id", "subscriptions.*"],
    })
    const raw = (result?.[0] as any)?.subscriptions ?? []
    // Map backend field names to the shape the frontend expects (MedusaSubscription type)
    const subscriptions = raw.map((s: any) => ({
      id: s.id,
      status: s.status,                                // "canceled" — frontend type accepts it
      interval_days: s.interval_days,
      next_delivery_at: s.next_billing_date,           // frontend uses next_delivery_at
      product_title: s.metadata?.product_title ?? null,
      variant_id: s.variant_id ?? null,
      unit_price: s.unit_price ?? null,
      quantity: s.quantity ?? null,
      created_at: s.created_at,
    }))
    res.json({ subscriptions })
  } catch (err) {
    const logger = req.scope.resolve("logger")
    logger.error(
      `[store/me/subscriptions] Failed to fetch subscriptions for customer ${customerId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    res.status(500).json({ message: "Failed to fetch subscriptions" })
  }
}
