// src/workflows/process-billing-cycle/steps/resolve-payment-provider.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type Input = {
  subscription_id: string
}

type Output = {
  provider_id: string
}

export async function resolvePaymentProviderStepFn(
  input: Input,
  { container }: { container: any }
): Promise<Output> {
  const logger = container.resolve("logger")
  const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
  const orderService = container.resolve(Modules.ORDER)

  try {
    const subscription = await subscriptionService.retrieveSubscription(input.subscription_id)

    if (!subscription.original_order_id) {
      logger.warn(`[resolve-payment-provider] No original_order_id on subscription ${input.subscription_id} — defaulting to pp_openpay_openpay`)
      return { provider_id: "pp_openpay_openpay" }
    }

    const order = await orderService.retrieveOrder(subscription.original_order_id, {
      relations: ["payment_collections.payment_sessions"],
    })

    const providerId = order?.payment_collections?.[0]?.payment_sessions?.[0]?.provider_id

    if (!providerId) {
      logger.warn(`[resolve-payment-provider] No payment session on order ${subscription.original_order_id} — defaulting to pp_openpay_openpay`)
      return { provider_id: "pp_openpay_openpay" }
    }

    logger.info(`[resolve-payment-provider] Subscription ${input.subscription_id} → provider: ${providerId}`)
    return { provider_id: providerId }
  } catch (err) {
    logger.error(
      `[resolve-payment-provider] Error: ${err instanceof Error ? err.message : String(err)} — defaulting to pp_openpay_openpay`
    )
    return { provider_id: "pp_openpay_openpay" }
  }
}

export const resolvePaymentProviderStep = createStep(
  "resolve-payment-provider-step",
  async (input: Input, { container }): Promise<StepResponse<Output, null>> => {
    const result = await resolvePaymentProviderStepFn(input, { container })
    return new StepResponse(result, null)
  }
)
