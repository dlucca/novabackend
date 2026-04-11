import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"
import { OpenpayClient } from "../../../modules/openpay-payment/openpay-client"
import { enviaCreateFulfillmentWorkflow } from "../../envia-create-fulfillment"

type ProcessBillingInput = {
  subscription_id: string
}

type BillingResult = {
  success?: boolean
  skipped?: boolean
  delayed?: boolean
  failed?: boolean
  reason?: string
  order_id?: string
  cycle_number?: number
}

export const processBillingStep = createStep(
  "process-billing-step",
  async (input: ProcessBillingInput, { container }): Promise<StepResponse<BillingResult, null>> => {
    const logger = container.resolve("logger")
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    const orderService = container.resolve(Modules.ORDER)
    const customerService = container.resolve(Modules.CUSTOMER)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const eventBus = container.resolve(Modules.EVENT_BUS)

    const LOG = `[process-billing] ${input.subscription_id}`

    // 1. Get subscription with its orders (to determine cycle number)
    const subscription = await subscriptionService.retrieveSubscription(
      input.subscription_id,
      { relations: ["subscription_orders"] }
    )

    if (subscription.status !== "active") {
      logger.info(`${LOG} Skipping: status=${subscription.status}`)
      return new StepResponse({ skipped: true, reason: "not_active" }, null)
    }

    if (!subscription.original_order_id) {
      logger.error(`${LOG} No original_order_id`)
      return new StepResponse({ skipped: true, reason: "no_original_order" }, null)
    }

    // 2. Get original order for pricing, region, shipping address
    const order = await orderService.retrieveOrder(subscription.original_order_id, {
      relations: ["items", "shipping_address", "billing_address"],
    })

    const subscriptionItem = (order.items ?? []).find(
      (item: any) => item.metadata?.is_subscription === true
    )

    if (!subscriptionItem) {
      logger.error(`${LOG} No subscription line item in original order ${order.id}`)
      return new StepResponse({ skipped: true, reason: "no_subscription_item" }, null)
    }

    // 3. Get customer
    if (!order.customer_id) {
      logger.error(`${LOG} Order ${order.id} has no customer_id`)
      return new StepResponse({ skipped: true, reason: "no_customer" }, null)
    }

    const [customer] = await customerService.listCustomers({ id: order.customer_id })
    if (!customer) {
      logger.error(`${LOG} Customer ${order.customer_id} not found`)
      return new StepResponse({ skipped: true, reason: "customer_not_found" }, null)
    }

    const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
    const openpayCustomerId = customer.metadata?.openpay_customer_id as string | undefined

    if (!openpayCustomerId) {
      logger.error(`${LOG} Customer ${customer.id} has no openpay_customer_id`)
      await subscriptionService.updateSubscriptions({ id: input.subscription_id, status: "past_due" })
      await eventBus.emit([{
        name: "subscription.payment_failed",
        data: {
          subscription_id: input.subscription_id,
          reason: "no_openpay_customer",
          customer_email: customer.email,
          customer_name: customerName,
        },
      }])
      return new StepResponse({ failed: true, reason: "no_openpay_customer" }, null)
    }

    // 4. Check inventory (fail-open: if check errors, proceed with billing)
    let inStock = true
    try {
      const { data: subData } = await query.graph({
        entity: "subscription",
        filters: { id: input.subscription_id },
        fields: ["id", "product_variant.id", "product_variant.allow_backorder"],
      })
      const linkedVariant = (subData[0] as any)?.product_variant

      if (linkedVariant?.id) {
        const { data: variantData } = await query.graph({
          entity: "product_variant",
          filters: { id: linkedVariant.id },
          fields: ["id", "inventory_quantity"],
        })
        const variant = variantData[0] as any
        if (
          variant &&
          !linkedVariant.allow_backorder &&
          typeof variant.inventory_quantity === "number" &&
          variant.inventory_quantity <= 0
        ) {
          inStock = false
        }
      }
    } catch {
      logger.warn(`${LOG} Inventory check failed — proceeding with billing`)
    }

    if (!inStock) {
      logger.info(`${LOG} Out of stock — marking delayed_out_of_stock`)
      await subscriptionService.updateSubscriptions({
        id: input.subscription_id,
        status: "delayed_out_of_stock",
      })
      return new StepResponse({ delayed: true, reason: "out_of_stock" }, null)
    }

    // 5. Resolve Openpay credentials
    const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
    const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
    const sandbox = process.env.OPENPAY_SANDBOX !== "false"

    if (!merchantId || !privateKey) {
      logger.error(`${LOG} Openpay credentials not configured`)
      return new StepResponse({ skipped: true, reason: "openpay_not_configured" }, null)
    }

    // 6. Get card to charge (default card, or first available in vault)
    let cardId = customer.metadata?.openpay_default_card_id as string | undefined
    if (!cardId) {
      const vaultClient = new OpenpayClient({ merchantId, privateKey, sandbox })
      const cards = await vaultClient.listCards(openpayCustomerId)
      cardId = cards[0]?.id
    }

    if (!cardId) {
      logger.error(`${LOG} No card available for customer ${customer.id}`)
      await subscriptionService.updateSubscriptions({ id: input.subscription_id, status: "past_due" })
      await eventBus.emit([{
        name: "subscription.payment_failed",
        data: {
          subscription_id: input.subscription_id,
          reason: "no_card",
          customer_email: customer.email,
          customer_name: customerName,
        },
      }])
      return new StepResponse({ failed: true, reason: "no_card" }, null)
    }

    // 7. Charge Openpay
    const client = new OpenpayClient({ merchantId, privateKey, sandbox })
    let charge: any
    try {
      charge = await client.chargeCustomerCard(openpayCustomerId, {
        source_id: cardId,
        // unit_price is stored as-is in Medusa (pesos, not centavos)
        amount: subscriptionItem.unit_price,
        currency: (order.currency_code ?? "MXN").toUpperCase(),
        description: `Novapatch renovación: ${subscriptionItem.title ?? "suscripción"}`,
        order_id: `sub-${input.subscription_id.slice(-8)}-${Date.now()}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`${LOG} Charge failed: ${message}`)
      await subscriptionService.updateSubscriptions({ id: input.subscription_id, status: "past_due" })
      await eventBus.emit([{
        name: "subscription.payment_failed",
        data: {
          subscription_id: input.subscription_id,
          reason: "charge_failed",
          error: message,
          customer_email: customer.email,
          customer_name: customerName,
          amount: subscriptionItem.unit_price,
        },
      }])
      return new StepResponse({ failed: true, reason: "charge_failed" }, null)
    }

    // 8. Create renewal order (clone from original)
    const cycleNumber = (subscription.subscription_orders?.length ?? 0) + 1
    const addr = order.shipping_address

    const [renewalOrder] = await orderService.createOrders([{
      currency_code: order.currency_code ?? "mxn",
      region_id: order.region_id ?? undefined,
      customer_id: order.customer_id ?? undefined,
      email: customer.email,
      sales_channel_id: order.sales_channel_id ?? undefined,
      ...(addr ? {
        shipping_address: {
          first_name: addr.first_name,
          last_name: addr.last_name,
          address_1: addr.address_1,
          address_2: addr.address_2,
          city: addr.city,
          country_code: addr.country_code,
          postal_code: addr.postal_code,
          phone: addr.phone,
        },
      } : {}),
      items: [{
        title: subscriptionItem.title ?? "Novapatch suscripción",
        variant_id: subscriptionItem.variant_id ?? undefined,
        unit_price: subscriptionItem.unit_price,
        quantity: subscriptionItem.quantity ?? 1,
        metadata: {
          is_subscription: true,
          interval_days: subscription.interval_days,
          cycle_number: cycleNumber,
          openpay_charge_id: charge.id,
        },
      }],
      metadata: {
        subscription_id: input.subscription_id,
        cycle_number: cycleNumber,
        openpay_charge_id: charge.id,
      },
      status: "pending",
    }])

    // 9. Create SubscriptionOrder record (order_id field drives the readOnly link to Order)
    await subscriptionService.createSubscriptionOrders([{
      subscription_id: input.subscription_id,
      order_id: renewalOrder.id,
      cycle_number: cycleNumber,
    }])

    // 10. Advance next_billing_date
    const nextBillingDate = new Date()
    nextBillingDate.setDate(nextBillingDate.getDate() + subscription.interval_days)

    await subscriptionService.updateSubscriptions({
      id: input.subscription_id,
      next_billing_date: nextBillingDate,
    })

    // 11. Emit renewal event
    await eventBus.emit([{
      name: "subscription.renewed",
      data: {
        subscription_id: input.subscription_id,
        order_id: renewalOrder.id,
        cycle_number: cycleNumber,
        amount: subscriptionItem.unit_price,
        currency_code: order.currency_code ?? "mxn",
        customer_email: customer.email,
        customer_name: customerName,
        next_billing_date: nextBillingDate.toISOString(),
        openpay_charge_id: charge.id,
      },
    }])

    logger.info(
      `${LOG} Billed successfully. Cycle ${cycleNumber}. Order: ${renewalOrder.id}. Next billing: ${nextBillingDate.toISOString()}`
    )

    // Generate shipping label — best-effort, does not roll back the charge if it fails
    if (process.env.ENVIA_API_TOKEN && process.env.ENVIA_API_URL) {
      try {
        await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId: renewalOrder.id } })
        logger.info(`${LOG} Envia fulfillment created for renewal order ${renewalOrder.id}`)
      } catch (enviaErr) {
        logger.error(
          `${LOG} Envia fulfillment failed for renewal order ${renewalOrder.id}: ${
            enviaErr instanceof Error ? enviaErr.message : String(enviaErr)
          } — operator can generate label manually`
        )
      }
    } else {
      logger.warn(`${LOG} ENVIA_API_TOKEN/URL not set — skipping fulfillment for renewal order ${renewalOrder.id}`)
    }

    return new StepResponse(
      { success: true, order_id: renewalOrder.id, cycle_number: cycleNumber },
      null
    )
  }
)
