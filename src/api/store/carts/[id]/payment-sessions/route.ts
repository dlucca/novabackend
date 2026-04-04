import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createPaymentCollectionForCartWorkflow } from "@medusajs/medusa/core-flows"

/**
 * POST /store/carts/:id/payment-sessions
 *
 * Initializes or retrieves the payment session for a cart.
 * Creates a payment collection if one doesn't exist, then
 * initializes a payment session for the Openpay provider.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT)

  // 1. Fetch cart with payment collection
  let cart: any = null
  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: [
        "id",
        "region_id",
        "currency_code",
        "total",
        "payment_collection.id",
        "payment_collection.payment_sessions.id",
        "payment_collection.payment_sessions.provider_id",
      ],
    })
    cart = carts?.[0] ?? null
  } catch (_err) {
    cart = null
  }

  if (!cart) {
    res.status(404).json({ message: "Cart not found" })
    return
  }

  // 2. Create payment collection if it doesn't exist
  if (!cart.payment_collection?.id) {
    try {
      await createPaymentCollectionForCartWorkflow(req.scope).run({
        input: { cart_id: cartId },
      })

      // Refetch cart with payment collection
      const { data: refreshed } = await query.graph({
        entity: "cart",
        filters: { id: cartId },
        fields: [
          "id",
          "payment_collection.id",
          "payment_collection.payment_sessions.id",
        ],
      })
      cart = refreshed?.[0] ?? cart
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create payment collection"
      res.status(422).json({ message })
      return
    }
  }

  const paymentCollectionId = cart.payment_collection?.id
  if (!paymentCollectionId) {
    res.status(422).json({ message: "Could not create payment collection for cart" })
    return
  }

  // 3. Get payment collection amount (set by createPaymentCollectionForCartWorkflow)
  let collectionAmount: number | undefined
  let collectionCurrency: string = cart.currency_code ?? "mxn"
  try {
    const { data: collections } = await query.graph({
      entity: "payment_collection",
      filters: { id: paymentCollectionId },
      fields: ["id", "amount", "currency_code"],
    })
    const collection = collections?.[0]
    collectionAmount = collection?.amount
    collectionCurrency = collection?.currency_code ?? collectionCurrency
  } catch (_err) {
    // continue with undefined — will fail below if so
  }

  if (collectionAmount === undefined || collectionAmount === null) {
    res.status(422).json({ message: "Payment collection has no amount. Ensure cart has items." })
    return
  }

  // 4. Initialize payment session for Openpay if not already present
  const existingSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.provider_id === "pp_openpay_openpay"
  )

  if (!existingSession) {
    try {
      await paymentModuleService.createPaymentSession(paymentCollectionId, {
        provider_id: "pp_openpay_openpay",
        data: {},
        currency_code: collectionCurrency,
        amount: collectionAmount,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create payment session"
      res.status(422).json({ message })
      return
    }
  }

  // 4. Return updated cart
  const { data: final } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "payment_collection.id",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.status",
    ],
  })

  res.json({ cart: final?.[0] ?? cart })
}
