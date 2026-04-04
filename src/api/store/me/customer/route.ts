import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const clerkEmail = (req as any).clerk_email
  const clerkUserId = (req as any).clerk_user_id

  if (!clerkEmail) {
    return res.status(400).json({ message: "No email in Clerk token" })
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)

  // Find existing customer by email
  const [existing] = await customerService.listCustomers({ email: clerkEmail })

  if (existing) {
    return res.json({
      customer: {
        id: existing.id,
        email: existing.email,
        first_name: existing.first_name,
        last_name: existing.last_name,
      },
    })
  }

  // Create new Medusa customer linked to Clerk user
  const customer = await customerService.createCustomers({
    email: clerkEmail,
    metadata: { clerk_user_id: clerkUserId },
  })

  return res.status(201).json({
    customer: {
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
    },
  })
}
