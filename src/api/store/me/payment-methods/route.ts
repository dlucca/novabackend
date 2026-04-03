import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../modules/openpay-payment/openpay-client"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.json({ payment_methods: [] })
    return
  }

  const customer = customers[0]
  const openpayCustomerId = customer.metadata?.openpay_customer_id as string | undefined
  const defaultCardId = customer.metadata?.openpay_default_card_id as string | undefined

  if (!openpayCustomerId) {
    res.json({ payment_methods: [] })
    return
  }

  const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
  const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
  const sandbox = process.env.OPENPAY_SANDBOX !== "false"

  if (!merchantId || !privateKey) {
    res.json({ payment_methods: [] })
    return
  }

  try {
    const client = new OpenpayClient({ merchantId, privateKey, sandbox })
    const cards = await client.listCards(openpayCustomerId)

    const payment_methods = cards.map((card) => ({
      id: card.id,
      brand: card.brand,
      last4: card.card_number,
      holder_name: card.holder_name,
      expiration_month: card.expiration_month,
      expiration_year: card.expiration_year,
      bank_name: card.bank_name,
      is_default: card.id === defaultCardId,
    }))

    res.json({ payment_methods })
  } catch (err) {
    res.status(502).json({ message: "Failed to retrieve payment methods from Openpay" })
  }
}
