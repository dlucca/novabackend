import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updateFrequencyStep } from "./steps/update-frequency"

type UpdateFrequencyInput = {
  subscription_id: string
  interval_days: number
}

const updateSubscriptionFrequencyWorkflow = createWorkflow(
  "update-subscription-frequency",
  function (input: UpdateFrequencyInput) {
    const result = updateFrequencyStep(input)
    return new WorkflowResponse(result)
  }
)

export default updateSubscriptionFrequencyWorkflow
