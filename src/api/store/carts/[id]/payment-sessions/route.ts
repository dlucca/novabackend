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
        "items.id",
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

  // Guard: reject checkout if cart has no line items (prevents charging only shipping)
  if (!cart.items || cart.items.length === 0) {
    res.status(422).json({ message: "Cart has no items. Add products before checkout." })
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
      const logger = req.scope.resolve("logger")
      logger.warn(`[PaymentSessions] Auto-add shipping failed: ${err instanceof Error ? err.message : String(err)}`)
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
  // Also fetch cart.total (includes promotion discounts) to use as authoritative amount
  const { data: refreshed } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "currency_code",
      "total",
      "subtotal",
      "discount_total",
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

  // Use cart.total (post-promotion) as the authoritative amount.
  // payment_collection.amount may be stale if a promotion was applied after
  // the collection was first created.
  const cartTotal: number = cart.total ?? cart.payment_collection?.amount
  const collectionCurrency = cart.payment_collection?.currency_code ?? cart.currency_code ?? "mxn"

  if (cartTotal == null) {
    res.status(422).json({ message: "Payment collection has no amount. Ensure cart has items." })
    return
  }

  const logger = req.scope.resolve("logger")
  logger.info(`[PaymentSessions] cart.total=${cartTotal} discount_total=${cart.discount_total ?? 0} collection.amount=${cart.payment_collection?.amount}`)

  // ── Pick provider based on cart currency ──────────────────────────────────
  // MP for ARS (Argentina), Openpay for everything else (Mexico today)
  const providerId =
    collectionCurrency.toLowerCase() === "ars"
      ? "pp_mercadopago_mercadopago"
      : "pp_openpay_openpay"

  // ── Create or update payment session with current cart total ──────────────
  const existingSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.provider_id === providerId
  )

  if (!existingSession) {
    try {
      await paymentModuleService.createPaymentSession(paymentCollectionId, {
        provider_id: providerId,
        data: {},
        currency_code: collectionCurrency,
        amount: cartTotal,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create payment session"
      res.status(422).json({ message })
      return
    }
  } else {
    // Session already exists — update its amount to reflect any promotions applied
    // since the session was first created (e.g. coupon applied after preload)
    try {
      await (paymentModuleService as any).updatePaymentSession({
        id: existingSession.id,
        amount: cartTotal,
        currency_code: collectionCurrency,
        data: existingSession.data ?? {},
      })
    } catch (err) {
      logger.warn(`[PaymentSessions] Could not update existing session amount: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Return cart data we already have — no extra query needed
  res.json({ cart: { id: cart.id, payment_collection: cart.payment_collection } })
}
