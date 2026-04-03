import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { cancelSubscriptionStep } from "./steps/cancel-subscription"

type CancelSubscriptionInput = {
  subscription_id: string
}

const cancelSubscriptionWorkflow = createWorkflow(
  "cancel-subscription",
  function (input: CancelSubscriptionInput) {
    const result = cancelSubscriptionStep(input)
    return new WorkflowResponse(result)
  }
)

export default cancelSubscriptionWorkflow
