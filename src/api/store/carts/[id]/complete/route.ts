import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const body = req.body as Record<string, unknown>
  const openpayTokenId = body.openpay_token_id as string | undefined
  // device_session_id is the Openpay anti-fraud device fingerprint.
  // Optional in dev/test but required by Openpay in production for fraud prevention.
  const deviceSessionId = body.device_session_id as string | undefined

  if (!openpayTokenId) {
    res.status(400).json({ message: "openpay_token_id is required" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Fetch the cart with its payment session
  let cart: any = null
  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: [
        "id",
        "payment_collection.id",
        "payment_collection.payment_sessions.id",
        "payment_collection.payment_sessions.data",
      ],
    })
    cart = carts?.[0] ?? null
  } catch (_err) {
    // query.graph may throw for invalid IDs
    cart = null
  }

  if (!cart) {
    res.status(404).json({ message: "Cart not found" })
    return
  }

  // Ensure a payment session exists before attempting to inject the token
  const session = (cart as any).payment_collection?.payment_sessions?.[0]

  if (!session?.id) {
    res.status(422).json({
      message:
        "Cart has no payment session. Call POST /store/carts/:id/payment-sessions first.",
    })
    return
  }

  // Inject the Openpay token into the payment session data
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
  await (paymentModuleService as any).updatePaymentSession({
    id: session.id,
    data: {
      ...(session.data ?? {}),
      openpay_token_id: openpayTokenId,
      device_session_id: deviceSessionId,
    },
  })

  // Run the standard Medusa complete cart workflow (authorizePayment is called inside)
  try {
    const { result } = await completeCartWorkflow(req.scope).run({
      input: { id: cartId },
    })
    res.json(result)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cart completion failed"
    res.status(422).json({ message })
  }
}
