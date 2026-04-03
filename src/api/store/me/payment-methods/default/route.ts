import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../../modules/openpay-payment/openpay-client"

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
  const openpayCustomerId = customer.metadata?.openpay_customer_id as string | undefined

  if (!openpayCustomerId) {
    res.status(422).json({ message: "Customer has no Openpay account. Complete a purchase first." })
    return
  }

  const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
  const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
  const sandbox = process.env.OPENPAY_SANDBOX !== "false"

  if (merchantId && privateKey) {
    // Validate the card belongs to this customer's Openpay vault
    try {
      const client = new OpenpayClient({ merchantId, privateKey, sandbox })
      const cards = await client.listCards(openpayCustomerId)
      const cardExists = cards.some((c) => c.id === cardId)
      if (!cardExists) {
        res.status(404).json({ message: "Card not found in customer's payment methods" })
        return
      }
    } catch (err) {
      const logger = req.scope.resolve("logger")
      logger.error(
        `[store/me/payment-methods/default] Failed to validate card ${cardId} for customer ${customer.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      res.status(502).json({ message: "Failed to validate card with Openpay" })
      return
    }
  }
  // When Openpay is not configured (dev/test), skip validation and trust the caller

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
