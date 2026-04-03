import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { pauseSubscriptionStep } from "./steps/pause-subscription"

type PauseSubscriptionInput = {
  subscription_id: string
}

const pauseSubscriptionWorkflow = createWorkflow(
  "pause-subscription",
  function (input: PauseSubscriptionInput) {
    const result = pauseSubscriptionStep(input)
    return new WorkflowResponse(result)
  }
)

export default pauseSubscriptionWorkflow
