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
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    const customerService = container.resolve(Modules.CUSTOMER)
    const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve("logger")

    // Idempotency check: if subscriptions already exist for this order, return early
    const existing = await subscriptionService.listSubscriptions({ original_order_id: input.order_id })
    if (existing.length > 0) {
      return new StepResponse(
        { subscription_ids: existing.map((s: any) => s.id) },
        null // nothing to compensate — we didn't create these
      )
    }

    // Retrieve order with items and payment data via query.graph
    // (orderService.retrieveOrder with dot-notation relations fails in MikroORM)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: input.order_id },
      fields: [
        "id",
        "customer_id",
        "items.id",
        "items.title",
        "items.variant_id",
        "items.metadata",
        "payment_collections.payments.data",
      ],
    })
    const order = orders[0] as any
    if (!order) {
      logger.warn(`[create-subscriptions-step] Order ${input.order_id} not found`)
      return new StepResponse(
        { subscription_ids: [] },
        { subscriptionIds: [], customerLinks: [], variantLinks: [] }
      )
    }

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
      const variantId = item.variant_id
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

    // Persist the payment provider's customer ID + card ID so future billing works.
    // The /complete route already does this, but we keep it here as a safety net
    // in case metadata wasn't persisted (e.g., customer not logged in at checkout).
    const paymentData = order.payment_collections?.[0]?.payments?.[0]?.data as Record<string, any> | undefined
    const openpayCustomerId = paymentData?.openpay_customer_id as string | undefined
    const mpCustomerId = paymentData?.mp_customer_id as string | undefined
    const mpCardId = paymentData?.mp_card_id as string | undefined

    if (order.customer_id && !openpayCustomerId && !mpCustomerId) {
      logger.warn(
        `[create-subscriptions-step] Order ${order.id}: no provider customer_id found in payment data. ` +
        `Future recurring billing for customer ${order.customer_id} may fail.`
      )
    }

    if (order.customer_id && (openpayCustomerId || mpCustomerId)) {
      const [customer] = await customerService.listCustomers({ id: order.customer_id })
      if (customer) {
        const extra: Record<string, string> = {}
        if (openpayCustomerId) extra.openpay_customer_id = openpayCustomerId
        if (mpCustomerId) extra.mp_customer_id = mpCustomerId
        if (mpCardId) extra.mp_default_card_id = mpCardId
        await customerService.updateCustomers(
          { id: order.customer_id },
          { metadata: { ...(customer.metadata ?? {}), ...extra } }
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
    const logger = container.resolve("logger")

    // Dismiss remote links first (before deleting subscriptions).
    // Each operation is wrapped independently so a failure in one never prevents the others.
    if (customerLinks?.length) {
      try {
        await remoteLink.dismiss(
          customerLinks.map(({ customer_id, subscription_id }) => ({
            [Modules.CUSTOMER]: { customer_id },
            [SUBSCRIPTION_MODULE]: { subscription_id },
          }))
        )
      } catch (err) {
        logger.error(
          `[create-subscriptions-step] Failed to dismiss customer links: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    if (variantLinks?.length) {
      try {
        await remoteLink.dismiss(
          variantLinks.map(({ subscription_id, product_variant_id }) => ({
            [SUBSCRIPTION_MODULE]: { subscription_id },
            [Modules.PRODUCT]: { product_variant_id },
          }))
        )
      } catch (err) {
        logger.error(
          `[create-subscriptions-step] Failed to dismiss variant links: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    if (subscriptionIds?.length) {
      try {
        await subscriptionService.deleteSubscriptions(subscriptionIds)
      } catch (err) {
        logger.error(
          `[create-subscriptions-step] Failed to delete subscriptions: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }
)
