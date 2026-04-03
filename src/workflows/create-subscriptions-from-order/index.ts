import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createSubscriptionsStep } from "./steps/create-subscriptions"

type Input = {
  order_id: string
}

const createSubscriptionsFromOrderWorkflow = createWorkflow(
  "create-subscriptions-from-order",
  function (input: Input) {
    const result = createSubscriptionsStep(input)
    return new WorkflowResponse(result)
  }
)

export default createSubscriptionsFromOrderWorkflow
