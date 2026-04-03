import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const body = req.body as Record<string, unknown>
  const openpayTokenId = body.openpay_token_id as string | undefined
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
    cart = carts?.find((c: any) => c?.id) ?? null
  } catch (_err) {
    // query.graph may throw for invalid IDs
    cart = null
  }

  if (!cart) {
    res.status(404).json({ message: "Cart not found" })
    return
  }

  // Inject the Openpay token into the payment session data
  const session = (cart.payment_collection as any)?.payment_sessions?.[0]
  if (session?.id) {
    const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
    await paymentModuleService.updatePaymentSession(session.id, {
      data: {
        ...(session.data ?? {}),
        openpay_token_id: openpayTokenId,
        device_session_id: deviceSessionId,
      },
    })
  }

  // Run the standard Medusa complete cart workflow (authorizePayment is called inside)
  const { result } = await completeCartWorkflow(req.scope).run({
    input: { id: cartId },
  })

  res.json(result)
}
