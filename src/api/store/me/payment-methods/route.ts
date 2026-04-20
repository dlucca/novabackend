// src/api/store/me/payment-methods/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../modules/openpay-payment/openpay-client"
import { MercadoPagoClient } from "../../../../modules/mercadopago-payment/mercadopago-client"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const regionId = req.query.region_id as string | undefined
  if (!regionId) {
    res.status(400).json({ message: "region_id query param is required" })
    return
  }

  const regionService = req.scope.resolve(Modules.REGION)
  let region: any
  try {
    region = await regionService.retrieveRegion(regionId)
  } catch {
    res.status(404).json({ message: "Region not found" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.json({ payment_methods: [] })
    return
  }

  const customer = customers[0]
  const logger = req.scope.resolve("logger")

  // Argentina (ARS) → MercadoPago vault
  if (region.currency_code === "ars") {
    const mpCustomerId = customer.metadata?.mp_customer_id as string | undefined
    if (!mpCustomerId) {
      res.json({ payment_methods: [] })
      return
    }

    const accessToken = process.env.MP_ACCESS_TOKEN ?? ""
    if (!accessToken) {
      res.json({ payment_methods: [] })
      return
    }

    try {
      const client = new MercadoPagoClient({ accessToken, sandbox: process.env.NODE_ENV !== "production" })
      const cards = await client.listCards(mpCustomerId)
      const defaultCardId = customer.metadata?.mp_default_card_id as string | undefined

      const payment_methods = cards.map((card) => ({
        id: card.id,
        brand: card.payment_method.id,
        last4: card.last_four_digits,
        exp_month: card.expiration_month,
        exp_year: card.expiration_year,
        is_default: card.id === defaultCardId,
      }))

      res.json({ payment_methods })
    } catch (err) {
      logger.error(
        `[store/me/payment-methods] MP error for customer ${mpCustomerId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      res.status(502).json({ message: "Failed to retrieve payment methods from MercadoPago" })
    }
    return
  }

  // Mexico (MXN) → Openpay vault (default)
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
      last4: String(card.card_number).slice(-4),
      exp_month: Number(card.expiration_month),
      exp_year: Number(card.expiration_year),
      is_default: card.id === defaultCardId,
    }))

    res.json({ payment_methods })
  } catch (err) {
    logger.error(
      `[store/me/payment-methods] Openpay error for customer ${openpayCustomerId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    res.status(502).json({ message: "Failed to retrieve payment methods from Openpay" })
  }
}
