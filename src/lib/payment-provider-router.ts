// src/lib/payment-provider-router.ts
import { MedusaContainer } from "@medusajs/framework/types"
import { OpenpayClient } from "../modules/openpay-payment/openpay-client"
import { MercadoPagoClient } from "../modules/mercadopago-payment/mercadopago-client"

export type ChargeParams = {
  customerId: string
  cardId: string
  amount: number
  currency: string
  description: string
  externalReference?: string
}

export type ChargeResult = {
  chargeId: string
}

export type ChargeClient = {
  chargeSubscription(params: ChargeParams): Promise<ChargeResult>
}

function makeOpenpayChargeClient(_container: MedusaContainer): ChargeClient {
  const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
  const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
  const sandbox = process.env.OPENPAY_SANDBOX !== "false"

  if (!merchantId || !privateKey) {
    throw new Error("Openpay credentials not configured (OPENPAY_MERCHANT_ID, OPENPAY_PRIVATE_KEY)")
  }

  const client = new OpenpayClient({ merchantId, privateKey, sandbox })

  return {
    async chargeSubscription({ customerId, cardId, amount, currency, description, externalReference }) {
      const charge = await client.chargeCustomerCard(customerId, {
        source_id: cardId,
        amount,
        currency,
        description,
        order_id: externalReference,
      })
      return { chargeId: charge.id }
    },
  }
}

function makeMercadoPagoChargeClient(_container: MedusaContainer): ChargeClient {
  const accessToken = process.env.MP_ACCESS_TOKEN ?? ""
  const sandbox = process.env.NODE_ENV !== "production"

  if (!accessToken) {
    throw new Error("MercadoPago credentials not configured (MP_ACCESS_TOKEN)")
  }

  const client = new MercadoPagoClient({ accessToken, sandbox })

  return {
    async chargeSubscription({ customerId, cardId, amount, currency, description, externalReference }) {
      // For recurring billing, get a charge token from the saved card (no CVV required)
      const chargeToken = await client.getCardToken(customerId, cardId)
      const payment = await client.charge({
        token: chargeToken,
        amount,
        currencyCode: currency,
        description,
        mpCustomerId: customerId,
        externalReference,
      })
      return { chargeId: String(payment.id) }
    },
  }
}

export function getChargeClient(providerId: string, container: MedusaContainer): ChargeClient {
  switch (providerId) {
    case "pp_openpay":
      return makeOpenpayChargeClient(container)
    case "pp_mercadopago":
      return makeMercadoPagoChargeClient(container)
    default:
      throw new Error(`No charge client configured for provider: ${providerId}`)
  }
}
