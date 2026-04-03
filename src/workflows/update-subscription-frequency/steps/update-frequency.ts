import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type UpdateFrequencyInput = {
  subscription_id: string
  interval_days: number
}

const VALID_INTERVALS = [30, 60, 90]

export const updateFrequencyStep = createStep(
  "update-frequency-step",
  async (input: UpdateFrequencyInput, { container }) => {
    if (!VALID_INTERVALS.includes(input.interval_days)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `interval_days must be one of ${VALID_INTERVALS.join(", ")}. Received: ${input.interval_days}`
      )
    }

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

    if (subscription.status !== "active" && subscription.status !== "paused") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot change frequency on a subscription with status: ${subscription.status}. Must be active or paused.`
      )
    }

    const previousIntervalDays = subscription.interval_days

    await subscriptionService.updateSubscriptions({
      id: input.subscription_id,
      interval_days: input.interval_days,
    })

    const updated = await subscriptionService.retrieveSubscription(
      input.subscription_id
    )

    return new StepResponse(updated, {
      subscription_id: input.subscription_id,
      previous_interval_days: previousIntervalDays,
    })
  },
  async (compensationData, { container }) => {
    if (!compensationData) return

    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    await subscriptionService.updateSubscriptions({
      id: compensationData.subscription_id,
      interval_days: compensationData.previous_interval_days,
    })
  }
)
