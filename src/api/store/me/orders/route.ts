import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

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

  const orderService = req.scope.resolve(Modules.ORDER)
  const orders = await orderService.listOrders(
    { customer_id: customerId },
    { select: ["id", "display_id", "status", "total", "created_at", "items"] }
  )

  res.json({ orders })
}
