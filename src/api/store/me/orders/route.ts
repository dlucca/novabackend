import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.json({ orders: [] })
    return
  }

  const customerId = customers[0].id

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  try {
    const { data: result } = await query.graph({
      entity: "order",
      filters: { customer_id: customerId },
      fields: ["id", "display_id", "status", "total", "created_at", "items.*"],
    })
    res.json({ orders: result ?? [] })
  } catch (err) {
    const logger = req.scope.resolve("logger")
    logger.error(
      `[store/me/orders] Failed for customer ${customerId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    res.status(500).json({ message: "Failed to fetch orders" })
  }
}
