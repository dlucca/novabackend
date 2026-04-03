import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { resumeSubscriptionStep } from "./steps/resume-subscription"

type ResumeSubscriptionInput = {
  subscription_id: string
}

const resumeSubscriptionWorkflow = createWorkflow(
  "resume-subscription",
  function (input: ResumeSubscriptionInput) {
    const result = resumeSubscriptionStep(input)
    return new WorkflowResponse(result)
  }
)

export default resumeSubscriptionWorkflow
