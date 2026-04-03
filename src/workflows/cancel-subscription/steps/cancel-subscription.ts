import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type CancelSubscriptionInput = {
  subscription_id: string
}

export const cancelSubscriptionStep = createStep(
  "cancel-subscription-step",
  async (input: CancelSubscriptionInput, { container }) => {
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

    if (subscription.status === "canceled") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Subscription is already canceled"
      )
    }

    const previousStatus = subscription.status
    const previousNextBillingDate = subscription.next_billing_date

    await subscriptionService.updateSubscriptions({
      id: input.subscription_id,
      status: "canceled",
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
