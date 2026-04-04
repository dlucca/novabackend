import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { processBillingStep } from "./steps/process-billing"

type ProcessBillingCycleInput = {
  subscription_id: string
}

const processBillingCycleWorkflow = createWorkflow(
  "process-billing-cycle",
  function (input: ProcessBillingCycleInput) {
    const result = processBillingStep(input)
    return new WorkflowResponse(result)
  }
)

export default processBillingCycleWorkflow
