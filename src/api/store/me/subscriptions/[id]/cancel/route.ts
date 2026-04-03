import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import cancelSubscriptionWorkflow from "../../../../../../workflows/cancel-subscription"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  try {
    const { result } = await cancelSubscriptionWorkflow(req.scope).run({
      input: { subscription_id: id },
    })
    res.json({ subscription: result })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}
