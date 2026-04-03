import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import updateSubscriptionFrequencyWorkflow from "../../../../../../workflows/update-subscription-frequency"

type UpdateFrequencyBody = { interval_days: 30 | 60 | 90 }

export const POST = async (
  req: MedusaRequest<UpdateFrequencyBody>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const { interval_days } = req.body

  if (!interval_days || ![30, 60, 90].includes(interval_days)) {
    res.status(400).json({ message: "interval_days must be 30, 60, or 90" })
    return
  }

  try {
    const { result } = await updateSubscriptionFrequencyWorkflow(
      req.scope
    ).run({
      input: { subscription_id: id, interval_days },
    })
    res.json({ subscription: result })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}
