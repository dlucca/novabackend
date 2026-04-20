// src/workflows/process-billing-cycle/index.ts
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { resolvePaymentProviderStep } from "./steps/resolve-payment-provider"
import { processBillingStep } from "./steps/process-billing"

type ProcessBillingCycleInput = {
  subscription_id: string
}

const processBillingCycleWorkflow = createWorkflow(
  "process-billing-cycle",
  function (input: ProcessBillingCycleInput) {
    const { provider_id } = resolvePaymentProviderStep({ subscription_id: input.subscription_id })
    const result = processBillingStep({ subscription_id: input.subscription_id, provider_id })
    return new WorkflowResponse(result)
  }
)

export default processBillingCycleWorkflow
