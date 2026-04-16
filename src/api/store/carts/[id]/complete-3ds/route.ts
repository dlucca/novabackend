import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../../modules/openpay-payment/openpay-client"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const logger = req.scope.resolve("logger")

  // Accept transaction ID from body OR from query string (Openpay redirects with ?id=...)
  const body = req.body as Record<string, unknown>
  const openpayTransactionId = (
    (body.openpay_transaction_id as string | undefined) ??
    (req.query?.id as string | undefined) ??
    (req.query?.openpay_transaction_id as string | undefined)
  )

  logger.info(`[Complete3DS] Request received — cartId=${cartId} transactionId=${openpayTransactionId ?? "MISSING"} body=${JSON.stringify(body)} query=${JSON.stringify(req.query)}`)

  if (!openpayTransactionId) {
    logger.error(`[Complete3DS] Missing openpay_transaction_id — cartId=${cartId}`)
    res.status(400).json({ message: "openpay_transaction_id is required" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Fetch cart with payment session
  let cart: any = null
  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: [
        "id",
        "payment_collection.id",
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
    logger.error(`[Complete3DS] Cart not found — cartId=${cartId}`)
    res.status(404).json({ message: "Cart not found" })
    return
  }

  const session = cart.payment_collection?.payment_sessions?.[0]
  if (!session?.id) {
    logger.error(`[Complete3DS] No payment session — cartId=${cartId}`)
    res.status(422).json({ message: "Cart has no payment session" })
    return
  }
  logger.info(`[Complete3DS] Session found — sessionId=${session.id} data=${JSON.stringify(session.data)}`)

  // Initialize Openpay client from env vars
  const openpay = new OpenpayClient({
    merchantId: process.env.OPENPAY_MERCHANT_ID!,
    privateKey: process.env.OPENPAY_PRIVATE_KEY!,
    sandbox: process.env.OPENPAY_SANDBOX !== "false",
  })

  try {
    // Verify the charge is confirmed at Openpay.
    // Charges created under a customer must be queried via the customer endpoint.
    // openpay_customer_id was persisted to session.data during /complete.
    const openpayCustomerId = (session.data as any)?.openpay_customer_id as string | undefined
    let charge: any
    if (openpayCustomerId) {
      charge = await openpay.getCustomerCharge(openpayCustomerId, openpayTransactionId)
    } else {
      charge = await openpay.getCharge(openpayTransactionId)
    }
    logger.info(`[Complete3DS] Charge lookup — id=${charge.id} status=${charge.status} customer_id=${openpayCustomerId ?? "n/a"}`)

    if (charge.status !== "completed") {
      logger.warn(`[Complete3DS] Charge not completed — status=${charge.status}`)
      res.status(422).json({ message: "Payment not confirmed by Openpay" })
      return
    }

    // Merge confirmed charge_id into existing session data
    // (openpay_customer_id and openpay_card_id were saved during /complete)
    const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
    await (paymentModuleService as any).updatePaymentSession({
      id: session.id,
      amount: session.amount,
      currency_code: session.currency_code ?? cart.payment_collection?.currency_code ?? "mxn",
      data: {
        ...(session.data ?? {}),
        openpay_charge_id: charge.id,
      },
    })

    // Run Medusa complete cart workflow — authorizePayment passthrough picks up charge_id
    logger.info(`[Complete3DS] Running completeCartWorkflow for cart=${cartId}`)
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
    let message = "Cart completion failed"
    if (err instanceof Error) {
      message = err.message
    } else if (typeof err === "object" && err !== null && "message" in err) {
      message = String((err as Record<string, unknown>).message)
    } else if (typeof err === "string") {
      message = err
    }
    logger.error(`[Complete3DS] Error for cart ${cartId}: ${err instanceof Error ? err.stack ?? err.message : JSON.stringify(err)}`)
    res.status(422).json({ message })
  }
}
