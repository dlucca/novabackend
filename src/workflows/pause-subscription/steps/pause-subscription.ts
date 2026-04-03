import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type PauseSubscriptionInput = {
  subscription_id: string
}

export const pauseSubscriptionStep = createStep(
  "pause-subscription-step",
  async (input: PauseSubscriptionInput, { container }) => {
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

    if (subscription.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Only active subscriptions can be paused. Current status: ${subscription.status}`
      )
    }

    const previousStatus = subscription.status

    await subscriptionService.updateSubscriptions({
      id: input.subscription_id,
      status: "paused",
    })

    const updated = await subscriptionService.retrieveSubscription(
      input.subscription_id
    )

    return new StepResponse(updated, {
      subscription_id: input.subscription_id,
      previous_status: previousStatus,
    })
  },
  async (compensationData, { container }) => {
    if (!compensationData) return

    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    await subscriptionService.updateSubscriptions({
      id: compensationData.subscription_id,
      status: compensationData.previous_status,
    })
  }
)
