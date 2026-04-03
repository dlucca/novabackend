import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const body = req.body as Record<string, unknown>
  const cardId = body.card_id as string | undefined

  if (!cardId) {
    res.status(400).json({ message: "card_id is required" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.status(404).json({ message: "Customer not found" })
    return
  }

  const customer = customers[0]

  await customerService.updateCustomers(
    { id: customer.id },
    {
      metadata: {
        ...(customer.metadata ?? {}),
        openpay_default_card_id: cardId,
      },
    }
  )

  res.json({ success: true, default_card_id: cardId })
}
