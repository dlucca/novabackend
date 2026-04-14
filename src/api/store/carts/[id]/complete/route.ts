import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../../modules/openpay-payment/openpay-client"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const body = req.body as Record<string, unknown>
  const openpayTokenId = body.openpay_token_id as string | undefined
  const customerEmail = body.email as string | undefined
  const deviceSessionId = body.device_session_id as string | undefined

  if (!openpayTokenId) {
    res.status(400).json({ message: "openpay_token_id is required" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve("logger")

  // Fetch cart with customer + payment session
  let cart: any = null
  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: [
        "id",
        "email",
        "total",
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

  const session = cart.payment_collection?.payment_sessions?.[0]
  if (!session?.id) {
    res.status(422).json({
      message: "Cart has no payment session. Call POST /store/carts/:id/payment-sessions first.",
    })
    return
  }

  const paymentAmount = cart.total ?? session.amount ?? cart.payment_collection?.amount
  if (!paymentAmount) {
    res.status(422).json({ message: "Cart has no chargeable amount" })
    return
  }
  logger.info(`[CompleteCart] cart.total=${cart.total} session.amount=${session.amount} using amount=${paymentAmount}`)

  // Initialize Openpay client from env vars
  const openpay = new OpenpayClient({
    merchantId: process.env.OPENPAY_MERCHANT_ID!,
    privateKey: process.env.OPENPAY_PRIVATE_KEY!,
    sandbox: process.env.OPENPAY_SANDBOX !== "false",
  })

  try {
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
      logger.info(`[CompleteCart] Created Openpay customer — id=${openpayCustomerId}`)
      // Persist Openpay customer ID to Medusa customer metadata for future checkouts
      if (cart.customer?.id) {
        try {
          const customerModuleService = req.scope.resolve(Modules.CUSTOMER)
          await (customerModuleService as any).updateCustomers(cart.customer.id, {
            metadata: { ...(cart.customer.metadata ?? {}), openpay_customer_id: openpayCustomerId },
          })
          logger.info(`[CompleteCart] Persisted openpay_customer_id to customer metadata — customer_id=${cart.customer.id}`)
        } catch (metaErr) {
          // Non-fatal: log and continue. The charge will still succeed; customer ID
          // will simply be re-created on the next checkout for this customer.
          logger.error(`[CompleteCart] Failed to persist openpay_customer_id to customer metadata: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`)
        }
      }
    }

    // 2. Store card using the one-time token
    const card = await openpay.storeCard(openpayCustomerId, {
      token_id: openpayTokenId,
      device_session_id: deviceSessionId,
    })
    logger.info(`[CompleteCart] Card stored — card_id=${card.id}`)

    // 3. Charge with 3DS enabled
    //    Openpay completes immediately if bank doesn't require 3DS,
    //    or returns payment_method.url if bank does require it.
    const currencyCode = (
      session.currency_code ??
      cart.payment_collection?.currency_code ??
      "MXN"
    ).toUpperCase()

    const charge = await openpay.chargeCustomerCard(openpayCustomerId, {
      source_id: card.id,
      amount: paymentAmount,
      currency: currencyCode,
      description: `Novapatch order - ${cartId}`,
      device_session_id: deviceSessionId,
      use_3d_secure: true,
      redirect_url: `${process.env.STOREFRONT_URL}/checkout/3ds-return`,
    })
    logger.info(`[CompleteCart] Charge created — charge_id=${charge.id} status=${charge.status}`)

    // 4. Persist charge data to payment session (authorizePayment passthrough reads this)
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

    // 5. Detect 3DS: Openpay sets payment_method.url when bank requires authentication
    if (charge.payment_method?.url) {
      logger.info(`[CompleteCart] 3DS required — charge_id=${charge.id}`)
      res.json({ type: "redirect", redirect_url: charge.payment_method.url })
      return
    }

    // 6. Direct charge — run Medusa complete cart workflow to create the order
    logger.info(`[CompleteCart] Direct charge confirmed — running completeCartWorkflow`)
    const { result } = await completeCartWorkflow(req.scope).run({
      input: { id: cartId },
    })

    // Emit order.payment_captured so fulfillment subscriber triggers
    const orderId = (result as any)?.order?.id ?? (result as any)?.id
    if (orderId) {
      try {
        const eventBus = req.scope.resolve(Modules.EVENT_BUS)
        await eventBus.emit([{ name: "order.payment_captured", data: { id: orderId } }])
      } catch (emitErr) {
        logger.error(
          `Failed to emit order.payment_captured for order ${orderId}: ${
            emitErr instanceof Error ? emitErr.message : String(emitErr)
          }`
        )
      }
    }

    res.json(result)
  } catch (err: unknown) {
    let message = "Payment failed"
    if (err instanceof Error) {
      message = err.message
    } else if (typeof err === "object" && err !== null && "message" in err) {
      message = String((err as Record<string, unknown>).message)
    } else if (typeof err === "string") {
      message = err
    }
    logger.error(`[CompleteCart] Error for cart ${cartId}: ${err instanceof Error ? err.stack ?? err.message : JSON.stringify(err)}`)
    res.status(422).json({ message })
  }
}
