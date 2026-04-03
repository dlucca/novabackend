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
  const { data: result } = await query.graph({
    entity: "customer",
    filters: { id: customerId },
    fields: ["id", "subscriptions.*"],
  })

  const subscriptions = (result?.[0] as any)?.subscriptions ?? []

  res.json({ subscriptions })
}
