import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createPaymentCollectionForCartWorkflow,
  addShippingMethodToCartWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * POST /store/carts/:id/payment-sessions
 *
 * Optimized: 1 query + 2 workflows (down from 5 queries + 2 workflows).
 * Adds shipping, creates payment collection, and initializes payment session.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT)

  // ── Single query: fetch cart with everything we need ──────────────────────
  let cart: any = null
  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: [
        "id",
        "currency_code",
        "shipping_methods.id",
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

  // ── Workflow 1: add shipping if missing (no extra query needed) ──────────
  const flatShippingOptionId = process.env.FLAT_SHIPPING_OPTION_ID
  const hasShipping = cart.shipping_methods?.length > 0
  if (flatShippingOptionId && !hasShipping) {
    try {
      await addShippingMethodToCartWorkflow(req.scope).run({
        input: { cart_id: cartId, options: [{ id: flatShippingOptionId }] },
      })
    } catch (err) {
      console.warn(`[PaymentSessions] Auto-add shipping failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Workflow 2: create payment collection (captures current cart total) ───
  try {
    await createPaymentCollectionForCartWorkflow(req.scope).run({
      input: { cart_id: cartId },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment collection"
    res.status(422).json({ message })
    return
  }

  // ── Single post-workflow query: get collection with amount ────────────────
  const { data: refreshed } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "currency_code",
      "payment_collection.id",
      "payment_collection.amount",
      "payment_collection.currency_code",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.status",
    ],
  })
  cart = refreshed?.[0] ?? cart

  const paymentCollectionId = cart.payment_collection?.id
  if (!paymentCollectionId) {
    res.status(422).json({ message: "Could not create payment collection for cart" })
    return
  }

  const collectionAmount = cart.payment_collection?.amount
  const collectionCurrency = cart.payment_collection?.currency_code ?? cart.currency_code ?? "mxn"

  if (collectionAmount == null) {
    res.status(422).json({ message: "Payment collection has no amount. Ensure cart has items." })
    return
  }

  // ── Create payment session if not present ─────────────────────────────────
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

  // Return cart data we already have — no extra query needed
  res.json({ cart: { id: cart.id, payment_collection: cart.payment_collection } })
}
