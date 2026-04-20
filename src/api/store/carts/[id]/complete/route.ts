import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../../modules/openpay-payment/openpay-client"
import { MercadoPagoClient } from "../../../../../modules/mercadopago-payment/mercadopago-client"

const CART_FIELDS = [
  "id",
  "email",
  "total",
  "currency_code",
  "customer.id",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "customer.metadata",
  "payment_collection.id",
  "payment_collection.amount",
  "payment_collection.currency_code",
  "payment_collection.payment_sessions.id",
  "payment_collection.payment_sessions.data",
  "payment_collection.payment_sessions.amount",
  "payment_collection.payment_sessions.currency_code",
]

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const body = req.body as Record<string, unknown>

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve("logger")

  let cart: any = null
  try {
    const { data: carts } = await query.graph({ entity: "cart", filters: { id: cartId }, fields: CART_FIELDS })
    cart = carts?.[0] ?? null
  } catch {
    cart = null
  }

  if (!cart) {
    res.status(404).json({ message: "Cart not found" })
    return
  }

  const session = cart.payment_collection?.payment_sessions?.[0]
  if (!session?.id) {
    res.status(422).json({ message: "Cart has no payment session. Call POST /store/carts/:id/payment-sessions first." })
    return
  }

  const paymentAmount = cart.total ?? session.amount ?? cart.payment_collection?.amount
  if (!paymentAmount) {
    res.status(422).json({ message: "Cart has no chargeable amount" })
    return
  }

  const currencyCode = (
    cart.currency_code ??
    session.currency_code ??
    cart.payment_collection?.currency_code ??
    "mxn"
  ).toLowerCase()

  logger.info(`[CompleteCart] cart=${cartId} currency=${currencyCode} amount=${paymentAmount}`)

  const isArgentina = currencyCode === "ars"

  try {
    if (isArgentina) {
      await completeMercadoPago({ req, res, cart, session, paymentAmount, cartId, body, logger })
    } else {
      await completeOpenpay({ req, res, cart, session, paymentAmount, cartId, body, logger })
    }
  } catch (err: unknown) {
    let message = "Payment failed"
    if (err instanceof Error) message = err.message
    else if (typeof err === "object" && err !== null && "message" in err) message = String((err as any).message)
    else if (typeof err === "string") message = err
    logger.error(`[CompleteCart] Error for cart ${cartId}: ${err instanceof Error ? err.stack ?? err.message : JSON.stringify(err)}`)
    res.status(422).json({ message })
  }
}

// ── MercadoPago (Argentina) ───────────────────────────────────────────────────

async function completeMercadoPago({
  req, res, cart, session, paymentAmount, cartId, body, logger,
}: any) {
  const mpCardToken = body.mp_card_token as string | undefined
  const customerEmail = body.email as string | undefined

  if (!mpCardToken) {
    res.status(400).json({ message: "mp_card_token is required for Argentina checkout" })
    return
  }

  const accessToken = process.env.MP_ACCESS_TOKEN ?? ""
  if (!accessToken) {
    res.status(500).json({ message: "MercadoPago not configured" })
    return
  }

  const mp = new MercadoPagoClient({ accessToken, sandbox: process.env.NODE_ENV !== "production" })

  const email = customerEmail ?? cart.customer?.email ?? cart.email ?? ""
  if (!email) {
    res.status(422).json({ message: "Customer email is required for payment" })
    return
  }

  // 1. Get or create MercadoPago customer
  const mpCustomer = await mp.getOrCreateCustomer({
    email,
    first_name: cart.customer?.first_name ?? "Customer",
    last_name: cart.customer?.last_name ?? "",
  })
  const mpCustomerId = mpCustomer.id
  logger.info(`[CompleteCart/MP] mp_customer_id=${mpCustomerId}`)

  // 2. Save card from one-time token → get card ID
  const card = await mp.createCard(mpCustomerId, mpCardToken)
  logger.info(`[CompleteCart/MP] card saved card_id=${card.id}`)

  // 3. Get a charge token from the saved card
  const chargeToken = await mp.getCardToken(mpCustomerId, card.id)

  // 4. Charge
  const currencyCode = (
    session.currency_code ??
    cart.payment_collection?.currency_code ??
    "ARS"
  ).toUpperCase()

  const payment = await mp.charge({
    token: chargeToken,
    amount: paymentAmount,
    currencyCode,
    description: `Novapatch order - ${cartId}`,
    mpCustomerId,
    externalReference: cartId,
  })
  logger.info(`[CompleteCart/MP] payment_id=${payment.id} status=${payment.status}`)

  // 5. Persist mp_customer_id and default card to customer metadata
  if (cart.customer?.id) {
    try {
      const customerModuleService = req.scope.resolve(Modules.CUSTOMER)
      await (customerModuleService as any).updateCustomers(cart.customer.id, {
        metadata: {
          ...(cart.customer.metadata ?? {}),
          mp_customer_id: mpCustomerId,
          mp_default_card_id: card.id,
        },
      })
      logger.info(`[CompleteCart/MP] Persisted mp_customer_id and mp_default_card_id to customer ${cart.customer.id}`)
    } catch (metaErr) {
      logger.error(`[CompleteCart/MP] Failed to persist MP metadata: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`)
    }
  }

  // 6. Update payment session with MP charge data
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
  await (paymentModuleService as any).updatePaymentSession({
    id: session.id,
    amount: paymentAmount,
    currency_code: session.currency_code ?? cart.payment_collection?.currency_code ?? "ars",
    data: {
      ...(session.data ?? {}),
      mp_payment_id: String(payment.id),
      mp_customer_id: mpCustomerId,
      mp_card_id: card.id,
    },
  })

  // 7. Complete cart
  logger.info(`[CompleteCart/MP] Running completeCartWorkflow`)
  const { result } = await completeCartWorkflow(req.scope).run({ input: { id: cartId } })

  await emitPaymentCaptured(req, result, logger)
  res.json(result)
}

// ── Openpay (Mexico) ──────────────────────────────────────────────────────────

async function completeOpenpay({
  req, res, cart, session, paymentAmount, cartId, body, logger,
}: any) {
  const openpayTokenId = body.openpay_token_id as string | undefined
  const customerEmail = body.email as string | undefined
  const deviceSessionId = body.device_session_id as string | undefined

  if (!openpayTokenId) {
    res.status(400).json({ message: "openpay_token_id is required" })
    return
  }

  const openpay = new OpenpayClient({
    merchantId: process.env.OPENPAY_MERCHANT_ID!,
    privateKey: process.env.OPENPAY_PRIVATE_KEY!,
    sandbox: process.env.OPENPAY_SANDBOX !== "false",
  })

  // 1. Create or retrieve Openpay customer
  let openpayCustomerId = cart.customer?.metadata?.openpay_customer_id as string | undefined
  if (!openpayCustomerId) {
    const email = customerEmail ?? cart.customer?.email ?? cart.email ?? ""
    if (!email) {
      res.status(422).json({ message: "Customer email is required for payment" })
      return
    }
    const openpayCustomer = await openpay.createCustomer({
      name: cart.customer?.first_name ?? "Customer",
      last_name: cart.customer?.last_name ?? "",
      email,
    })
    openpayCustomerId = openpayCustomer.id
    logger.info(`[CompleteCart/Openpay] Created customer id=${openpayCustomerId}`)

    if (cart.customer?.id) {
      try {
        const customerModuleService = req.scope.resolve(Modules.CUSTOMER)
        await (customerModuleService as any).updateCustomers(cart.customer.id, {
          metadata: { ...(cart.customer.metadata ?? {}), openpay_customer_id: openpayCustomerId },
        })
        logger.info(`[CompleteCart/Openpay] Persisted openpay_customer_id to customer ${cart.customer.id}`)
      } catch (metaErr) {
        logger.error(`[CompleteCart/Openpay] Failed to persist openpay_customer_id: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`)
      }
    }
  }

  // 2. Store card
  const card = await openpay.storeCard(openpayCustomerId, {
    token_id: openpayTokenId,
    device_session_id: deviceSessionId,
  })
  logger.info(`[CompleteCart/Openpay] Card stored card_id=${card.id}`)

  // 3. Charge with 3DS
  const currencyCode = (
    session.currency_code ??
    cart.payment_collection?.currency_code ??
    "MXN"
  ).toUpperCase()

  const isSandbox = process.env.OPENPAY_SANDBOX !== "false"
  const charge = await openpay.chargeCustomerCard(openpayCustomerId, {
    source_id: card.id,
    amount: paymentAmount,
    currency: currencyCode,
    description: `Novapatch order - ${cartId}`,
    device_session_id: deviceSessionId,
    use_3d_secure: !isSandbox,
    redirect_url: `${process.env.STOREFRONT_URL}/checkout/3ds-return`,
  })
  logger.info(`[CompleteCart/Openpay] Charge created charge_id=${charge.id} status=${charge.status}`)

  // 4. Persist charge data to payment session
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
  await (paymentModuleService as any).updatePaymentSession({
    id: session.id,
    amount: paymentAmount,
    currency_code: session.currency_code ?? cart.payment_collection?.currency_code ?? "mxn",
    data: {
      ...(session.data ?? {}),
      openpay_charge_id: charge.id,
      openpay_customer_id: openpayCustomerId,
      openpay_card_id: card.id,
    },
  })

  // 5. Detect 3DS redirect
  if (charge.status === "charge_pending" && charge.payment_method?.url) {
    logger.info(`[CompleteCart/Openpay] 3DS required charge_id=${charge.id}`)
    res.json({ type: "redirect", redirect_url: charge.payment_method.url })
    return
  }

  // 6. Complete cart
  logger.info(`[CompleteCart/Openpay] Direct charge confirmed — running completeCartWorkflow`)
  const { result } = await completeCartWorkflow(req.scope).run({ input: { id: cartId } })

  await emitPaymentCaptured(req, result, logger)
  res.json(result)
}

// ── Shared ────────────────────────────────────────────────────────────────────

async function emitPaymentCaptured(req: MedusaRequest, result: any, logger: any) {
  const orderId = (result as any)?.order?.id ?? (result as any)?.id
  if (!orderId) return
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit([{ name: "order.payment_captured", data: { id: orderId } }])
  } catch (emitErr) {
    logger.error(`Failed to emit order.payment_captured for order ${orderId}: ${emitErr instanceof Error ? emitErr.message : String(emitErr)}`)
  }
}
