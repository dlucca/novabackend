import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type CreateSubscriptionsInput = {
  order_id: string
}

type CompensationData = {
  subscriptionIds: string[]
  customerLinks: Array<{ customer_id: string; subscription_id: string }>
  variantLinks: Array<{ subscription_id: string; product_variant_id: string }>
}

export const createSubscriptionsStep = createStep(
  "create-subscriptions-step",
  async (input: CreateSubscriptionsInput, { container }) => {
    const orderService = container.resolve(Modules.ORDER)
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    const customerService = container.resolve(Modules.CUSTOMER)
    const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)
    const logger = container.resolve("logger")

    // Idempotency check: if subscriptions already exist for this order, return early
    const existing = await subscriptionService.listSubscriptions({ original_order_id: input.order_id })
    if (existing.length > 0) {
      return new StepResponse(
        { subscription_ids: existing.map((s: any) => s.id) },
        null as unknown as CompensationData // nothing to compensate — we didn't create these
      )
    }

    // Retrieve order with items and payment data
    const order = await orderService.retrieveOrder(input.order_id, {
      relations: ["items", "items.variant", "payment_collections", "payment_collections.payments"],
    })

    const subscriptionItems = (order.items ?? []).filter(
      (item: any) => item.metadata?.is_subscription === true
    )

    if (subscriptionItems.length === 0) {
      return new StepResponse(
        { subscription_ids: [] },
        { subscriptionIds: [], customerLinks: [], variantLinks: [] }
      )
    }

    const now = new Date()
    const createdIds: string[] = []
    const customerLinks: CompensationData["customerLinks"] = []
    const variantLinks: CompensationData["variantLinks"] = []

    for (const item of subscriptionItems) {
      const rawInterval = item.metadata?.interval_days
      const intervalDays = Number(rawInterval)
      if (![30, 60, 90].includes(intervalDays)) {
        logger.warn(
          `[create-subscriptions-step] Skipping item ${item.id}: invalid interval_days "${rawInterval}". Expected 30, 60, or 90.`
        )
        continue
      }

      const nextBillingDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)

      const [subscription] = await subscriptionService.createSubscriptions([
        {
          status: "active",
          interval_days: intervalDays,
          next_billing_date: nextBillingDate,
          original_order_id: order.id,
          metadata: {
            discount_percentage: item.metadata?.discount_percentage ?? null,
            product_title: item.title ?? null,
          },
        },
      ])

      createdIds.push(subscription.id)

      // Link Customer ↔ Subscription (stored link defined in src/links/subscription-customer.ts)
      if (order.customer_id) {
        await remoteLink.create([
          {
            [Modules.CUSTOMER]: { customer_id: order.customer_id },
            [SUBSCRIPTION_MODULE]: { subscription_id: subscription.id },
          },
        ])
        customerLinks.push({ customer_id: order.customer_id, subscription_id: subscription.id })
      }

      // Link Subscription ↔ ProductVariant (stored link defined in src/links/subscription-product-variant.ts)
      const variantId = (item as any).variant?.id ?? (item as any).variant_id
      if (variantId) {
        await remoteLink.create([
          {
            [SUBSCRIPTION_MODULE]: { subscription_id: subscription.id },
            [Modules.PRODUCT]: { product_variant_id: variantId },
          },
        ])
        variantLinks.push({ subscription_id: subscription.id, product_variant_id: variantId })
      }
    }

    // Persist the Openpay customer ID on the Medusa customer so future billing works
    const openpayCustomerId = (order as any).payment_collections?.[0]
      ?.payments?.[0]?.data?.openpay_customer_id as string | undefined

    if (openpayCustomerId && order.customer_id) {
      const [customer] = await customerService.listCustomers({ id: order.customer_id })
      if (customer) {
        await customerService.updateCustomers(
          { id: order.customer_id },
          {
            metadata: {
              ...(customer.metadata ?? {}),
              openpay_customer_id: openpayCustomerId,
            },
          }
        )
      }
    }

    return new StepResponse(
      { subscription_ids: createdIds },
      { subscriptionIds: createdIds, customerLinks, variantLinks }
    )
  },

  // Compensation: if later steps fail, dismiss remote links and delete the subscriptions we created
  async (data: CompensationData | null, { container }) => {
    if (!data) return
    const { subscriptionIds, customerLinks, variantLinks } = data
    const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    // Dismiss remote links first (before deleting subscriptions)
    if (customerLinks?.length) {
      await remoteLink.dismiss(
        customerLinks.map(({ customer_id, subscription_id }) => ({
          [Modules.CUSTOMER]: { customer_id },
          [SUBSCRIPTION_MODULE]: { subscription_id },
        }))
      )
    }
    if (variantLinks?.length) {
      await remoteLink.dismiss(
        variantLinks.map(({ subscription_id, product_variant_id }) => ({
          [SUBSCRIPTION_MODULE]: { subscription_id },
          [Modules.PRODUCT]: { product_variant_id },
        }))
      )
    }
    if (subscriptionIds?.length) {
      await subscriptionService.deleteSubscriptions(subscriptionIds)
    }
  }
)
