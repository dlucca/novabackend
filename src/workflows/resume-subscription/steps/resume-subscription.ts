import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type ResumeSubscriptionInput = {
  subscription_id: string
}

export const resumeSubscriptionStep = createStep(
  "resume-subscription-step",
  async (input: ResumeSubscriptionInput, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionService.retrieveSubscription(
      input.subscription_id
    )

    if (!subscription) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Subscription with id ${input.subscription_id} not found`
      )
    }

    if (subscription.status !== "paused") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Only paused subscriptions can be resumed. Current status: ${subscription.status}`
      )
    }

    const previousStatus = subscription.status
    const previousNextBillingDate = subscription.next_billing_date

    const newNextBillingDate = new Date()
    newNextBillingDate.setDate(
      newNextBillingDate.getDate() + subscription.interval_days
    )

    await subscriptionService.updateSubscriptions({
      id: input.subscription_id,
      status: "active",
      next_billing_date: newNextBillingDate,
    })

    const updated = await subscriptionService.retrieveSubscription(
      input.subscription_id
    )

    return new StepResponse(updated, {
      subscription_id: input.subscription_id,
      previous_status: previousStatus,
      previous_next_billing_date: previousNextBillingDate,
    })
  },
  async (compensationData, { container }) => {
    if (!compensationData) return

    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    await subscriptionService.updateSubscriptions({
      id: compensationData.subscription_id,
      status: compensationData.previous_status,
      next_billing_date: compensationData.previous_next_billing_date,
    })
  }
)
