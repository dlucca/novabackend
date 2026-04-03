import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type CreateSubscriptionsInput = {
  order_id: string
}

export const createSubscriptionsStep = createStep(
  "create-subscriptions-step",
  async (input: CreateSubscriptionsInput, { container }) => {
    const orderService = container.resolve(Modules.ORDER)
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    const customerService = container.resolve(Modules.CUSTOMER)
    const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)

    // Retrieve order with items and payment data
    const order = await orderService.retrieveOrder(input.order_id, {
      relations: ["items", "payment_collections", "payment_collections.payments"],
    })

    const subscriptionItems = (order.items ?? []).filter(
      (item: any) => item.metadata?.is_subscription === true
    )

    if (subscriptionItems.length === 0) {
      return new StepResponse({ subscription_ids: [] }, [] as string[])
    }

    const now = new Date()
    const createdIds: string[] = []

    for (const item of subscriptionItems) {
      const intervalDays = Number(item.metadata?.interval_days ?? 30)
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
      }

      // Link Subscription ↔ ProductVariant (stored link defined in src/links/subscription-product-variant.ts)
      if ((item as any).variant_id) {
        await remoteLink.create([
          {
            [SUBSCRIPTION_MODULE]: { subscription_id: subscription.id },
            [Modules.PRODUCT]: { product_variant_id: (item as any).variant_id },
          },
        ])
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

    return new StepResponse({ subscription_ids: createdIds }, createdIds)
  },

  // Compensation: if later steps fail, delete the subscriptions we created
  async (createdIds: string[], { container }) => {
    if (!createdIds?.length) return
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.deleteSubscriptions(createdIds)
  }
)
