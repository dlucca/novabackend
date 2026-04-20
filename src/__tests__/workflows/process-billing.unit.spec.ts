// src/__tests__/workflows/process-billing.unit.spec.ts
//
// Tests the billing logic that runs nightly to charge subscriptions.
// Pattern: inline the step logic as runBillingLogic(deps, input) and inject
// mocked services — same approach as process-daily-subscriptions.unit.spec.ts.

import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../modules/openpay-payment/openpay-client"
import { getChargeClient } from "../../lib/payment-provider-router"
import { enviaCreateFulfillmentWorkflow } from "../../workflows/envia-create-fulfillment"

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockOpenpayClient = {
  listCards: jest.fn(),
}
jest.mock("../../modules/openpay-payment/openpay-client", () => ({
  OpenpayClient: jest.fn().mockImplementation(() => mockOpenpayClient),
}))

// mockChargeClient must be declared with var so it is hoisted before jest.mock factories run
// eslint-disable-next-line no-var
var mockChargeClient = {
  chargeSubscription: jest.fn(),
}
jest.mock("../../lib/payment-provider-router", () => ({
  getChargeClient: jest.fn().mockReturnValue(mockChargeClient),
}))

// mockEnviaRun must be declared with var so it is hoisted before jest.mock factories run
// eslint-disable-next-line no-var
var mockEnviaRun = jest.fn()
jest.mock("../../workflows/envia-create-fulfillment", () => ({
  enviaCreateFulfillmentWorkflow: jest.fn().mockImplementation(() => ({
    run: (...args: any[]) => mockEnviaRun(...args),
  })),
}))

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockSubscriptionService = {
  retrieveSubscription: jest.fn(),
  updateSubscriptions: jest.fn(),
  createSubscriptionOrders: jest.fn(),
}
const mockOrderService = {
  retrieveOrder: jest.fn(),
  createOrders: jest.fn(),
}
const mockCustomerService = {
  retrieveCustomer: jest.fn(),
}
const mockEventBus = { emit: jest.fn() }
const mockQuery = { graph: jest.fn() }
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUB_ID = "sub_abc123"

const baseSubscription = {
  id: SUB_ID,
  status: "active",
  interval_days: 30,
  original_order_id: "ord_1",
  subscription_orders: [],
}

const baseOrder = {
  id: "ord_1",
  customer_id: "cust_1",
  currency_code: "mxn",
  region_id: "reg_1",
  sales_channel_id: "sc_1",
  items: [
    {
      id: "item_1",
      title: "Novapatch Energy",
      variant_id: "var_1",
      unit_price: 31920,
      quantity: 1,
      metadata: { is_subscription: true, interval_days: 30 },
    },
  ],
  shipping_address: {
    first_name: "Luis",
    last_name: "Pérez",
    address_1: "Insurgentes Sur 2000",
    city: "CDMX",
    country_code: "mx",
    postal_code: "03100",
    phone: "+525511111111",
  },
}

const baseCustomer = {
  id: "cust_1",
  email: "luis@test.com",
  first_name: "Luis",
  last_name: "Pérez",
  metadata: {
    openpay_customer_id: "op_cust_1",
    openpay_default_card_id: "card_1",
  },
}

const baseChargeResult = { chargeId: "ch_1" }
const baseRenewalOrder = { id: "ord_renewal_1" }

// ── Deps builder ──────────────────────────────────────────────────────────────

function makeDeps() {
  return {
    subscriptionService: mockSubscriptionService,
    orderService: mockOrderService,
    customerService: mockCustomerService,
    query: mockQuery,
    eventBus: mockEventBus,
    logger: mockLogger,
    container: {} as any,
  }
}

type Deps = ReturnType<typeof makeDeps>
type BillingResult = {
  success?: boolean
  skipped?: boolean
  delayed?: boolean
  failed?: boolean
  reason?: string
  order_id?: string
  cycle_number?: number
}

async function runBillingLogic(
  deps: Deps,
  input: { subscription_id: string; provider_id?: string }
): Promise<BillingResult> {
  const { subscriptionService, orderService, customerService, query, eventBus, logger, container } = deps
  const LOG = `[process-billing] ${input.subscription_id}`

  const subscription = await subscriptionService.retrieveSubscription(
    input.subscription_id,
    { relations: ["subscription_orders"] }
  )

  if (subscription.status !== "active") {
    logger.info(`${LOG} Skipping: status=${subscription.status}`)
    return { skipped: true, reason: "not_active" }
  }

  if (!subscription.original_order_id) {
    logger.error(`${LOG} No original_order_id`)
    return { skipped: true, reason: "no_original_order" }
  }

  const order = await orderService.retrieveOrder(subscription.original_order_id, {
    relations: ["items", "shipping_address", "billing_address"],
  })

  const subscriptionItem = (order.items ?? []).find(
    (item: any) => item.metadata?.is_subscription === true
  )

  if (!subscriptionItem) {
    logger.error(`${LOG} No subscription line item in original order ${order.id}`)
    return { skipped: true, reason: "no_subscription_item" }
  }

  if (!order.customer_id) {
    logger.error(`${LOG} Order ${order.id} has no customer_id`)
    return { skipped: true, reason: "no_customer" }
  }

  let customer: any
  try {
    customer = await customerService.retrieveCustomer(order.customer_id)
  } catch {
    customer = null
  }
  if (!customer) {
    logger.error(`${LOG} Customer ${order.customer_id} not found`)
    return { skipped: true, reason: "customer_not_found" }
  }

  const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
  const resolvedProvider = input.provider_id ?? "pp_openpay"
  const vaultCustomerIdKey = resolvedProvider === "pp_mercadopago" ? "mp_customer_id" : "openpay_customer_id"
  const vaultCustomerId = customer.metadata?.[vaultCustomerIdKey] as string | undefined

  if (!vaultCustomerId) {
    logger.error(`${LOG} Customer ${customer.id} has no ${vaultCustomerIdKey}`)
    await subscriptionService.updateSubscriptions({ id: input.subscription_id, status: "past_due" })
    await eventBus.emit([{
      name: "subscription.payment_failed",
      data: {
        subscription_id: input.subscription_id,
        reason: `no_${vaultCustomerIdKey}`,
        customer_email: customer.email,
        customer_name: customerName,
      },
    }])
    return { failed: true, reason: `no_${vaultCustomerIdKey}` }
  }

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
    await subscriptionService.updateSubscriptions({
      id: input.subscription_id,
      status: "delayed_out_of_stock",
    })
    return { delayed: true, reason: "out_of_stock" }
  }

  let chargeClientInstance: ReturnType<typeof getChargeClient>
  try {
    chargeClientInstance = getChargeClient(resolvedProvider, container)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${LOG} Payment provider not configured: ${message}`)
    return { skipped: true, reason: "provider_not_configured" }
  }

  const defaultCardIdKey = resolvedProvider === "pp_mercadopago" ? "mp_default_card_id" : "openpay_default_card_id"
  let cardId = customer.metadata?.[defaultCardIdKey] as string | undefined

  if (!cardId) {
    if (resolvedProvider === "pp_mercadopago") {
      // MercadoPago fallback: not tested here; tested in mp-specific tests
    } else {
      const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
      const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
      const sandbox = process.env.OPENPAY_SANDBOX !== "false"
      if (merchantId && privateKey) {
        const openpayClient = new OpenpayClient({ merchantId, privateKey, sandbox } as any)
        const cards = await (openpayClient as any).listCards(vaultCustomerId)
        cardId = cards[0]?.id
      }
    }
  }

  if (!cardId) {
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
    return { failed: true, reason: "no_card" }
  }

  let chargeResult: { chargeId: string }
  try {
    chargeResult = await chargeClientInstance.chargeSubscription({
      customerId: vaultCustomerId,
      cardId,
      amount: subscriptionItem.unit_price,
      currency: (order.currency_code ?? "MXN").toUpperCase(),
      description: `Novapatch renovación: ${subscriptionItem.title ?? "suscripción"}`,
      externalReference: `sub-${input.subscription_id.slice(-8)}-${Date.now()}`,
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
    return { failed: true, reason: "charge_failed" }
  }

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
        charge_id: chargeResult.chargeId,
        payment_provider: resolvedProvider,
      },
    }],
    metadata: {
      subscription_id: input.subscription_id,
      cycle_number: cycleNumber,
      charge_id: chargeResult.chargeId,
      payment_provider: resolvedProvider,
    },
    status: "pending",
  }])

  await subscriptionService.createSubscriptionOrders([{
    subscription_id: input.subscription_id,
    order_id: renewalOrder.id,
    cycle_number: cycleNumber,
  }])

  const nextBillingDate = new Date()
  nextBillingDate.setDate(nextBillingDate.getDate() + subscription.interval_days)

  await subscriptionService.updateSubscriptions({
    id: input.subscription_id,
    next_billing_date: nextBillingDate,
  })

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
      charge_id: chargeResult.chargeId,
      payment_provider: resolvedProvider,
    },
  }])

  if (process.env.ENVIA_API_TOKEN && process.env.ENVIA_API_URL) {
    try {
      await (enviaCreateFulfillmentWorkflow as any)({}).run({
        input: { orderId: renewalOrder.id },
      })
    } catch (enviaErr) {
      logger.error(
        `${LOG} Envia fulfillment failed for renewal order ${renewalOrder.id}: ${
          enviaErr instanceof Error ? enviaErr.message : String(enviaErr)
        }`
      )
    }
  }

  return { success: true, order_id: renewalOrder.id, cycle_number: cycleNumber }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("process-billing", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENPAY_MERCHANT_ID = "test_merchant"
    process.env.OPENPAY_PRIVATE_KEY = "test_key"
    process.env.OPENPAY_SANDBOX = "true"
    delete process.env.ENVIA_API_TOKEN
    delete process.env.ENVIA_API_URL

    mockSubscriptionService.retrieveSubscription.mockResolvedValue({ ...baseSubscription })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
    mockSubscriptionService.createSubscriptionOrders.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue({ ...baseOrder })
    mockOrderService.createOrders.mockResolvedValue([baseRenewalOrder])
    mockCustomerService.retrieveCustomer.mockResolvedValue({ ...baseCustomer })
    mockEventBus.emit.mockResolvedValue(undefined)
    mockChargeClient.chargeSubscription.mockResolvedValue(baseChargeResult);
    (getChargeClient as jest.Mock).mockReturnValue(mockChargeClient)
    mockQuery.graph.mockImplementation(({ entity }: any) => {
      if (entity === "subscription") {
        return Promise.resolve({ data: [{ product_variant: { id: "var_1", allow_backorder: false } }] })
      }
      return Promise.resolve({ data: [{ id: "var_1", inventory_quantity: 10 }] })
    })
  })

  it("status not active → skips with reason not_active", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({ ...baseSubscription, status: "paused" })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "not_active" })
    expect(mockOrderService.retrieveOrder).not.toHaveBeenCalled()
  })

  it("no original_order_id → skips with reason no_original_order", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({ ...baseSubscription, original_order_id: null })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "no_original_order" })
  })

  it("no subscription line item → skips with reason no_subscription_item", async () => {
    mockOrderService.retrieveOrder.mockResolvedValue({ ...baseOrder, items: [{ id: "item_x", metadata: { is_subscription: false } }] })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "no_subscription_item" })
  })

  it("no customer_id on order → skips with reason no_customer", async () => {
    mockOrderService.retrieveOrder.mockResolvedValue({ ...baseOrder, customer_id: null })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "no_customer" })
  })

  it("customer not found → skips with reason customer_not_found", async () => {
    mockCustomerService.retrieveCustomer.mockRejectedValue(new Error("not found"))
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "customer_not_found" })
  })

  it("no openpay_customer_id → marks past_due", async () => {
    mockCustomerService.retrieveCustomer.mockResolvedValue({ ...baseCustomer, metadata: {} })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ failed: true, reason: "no_openpay_customer_id" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ id: SUB_ID, status: "past_due" }))
  })

  it("no openpay_customer_id → emits payment_failed with correct payload", async () => {
    mockCustomerService.retrieveCustomer.mockResolvedValue({ ...baseCustomer, metadata: {} })
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "subscription.payment_failed",
        data: expect.objectContaining({ subscription_id: SUB_ID, reason: "no_openpay_customer_id", customer_email: "luis@test.com", customer_name: "Luis Pérez" }),
      }),
    ])
  })

  it("out of stock → marks delayed_out_of_stock and returns delayed", async () => {
    mockQuery.graph.mockImplementation(({ entity }: any) => {
      if (entity === "subscription") return Promise.resolve({ data: [{ product_variant: { id: "var_1", allow_backorder: false } }] })
      return Promise.resolve({ data: [{ id: "var_1", inventory_quantity: 0 }] })
    })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ delayed: true, reason: "out_of_stock" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ id: SUB_ID, status: "delayed_out_of_stock" }))
    expect(mockChargeClient.chargeSubscription).not.toHaveBeenCalled()
  })

  it("inventory check throws → fail-open: proceeds with billing", async () => {
    mockQuery.graph.mockRejectedValue(new Error("query timeout"))
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Inventory check failed"))
    expect(mockChargeClient.chargeSubscription).toHaveBeenCalled()
  })

  it("allow_backorder true + inventory 0 → proceeds with billing (not delayed)", async () => {
    mockQuery.graph.mockImplementation(({ entity }: any) => {
      if (entity === "subscription") return Promise.resolve({ data: [{ product_variant: { id: "var_1", allow_backorder: true } }] })
      return Promise.resolve({ data: [{ id: "var_1", inventory_quantity: 0 }] })
    })
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockChargeClient.chargeSubscription).toHaveBeenCalled()
  })

  it("no default card + empty vault → marks past_due and emits payment_failed", async () => {
    mockCustomerService.retrieveCustomer.mockResolvedValue({ ...baseCustomer, metadata: { openpay_customer_id: "op_cust_1" } })
    mockOpenpayClient.listCards.mockResolvedValue([])
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ failed: true, reason: "no_card" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ id: SUB_ID, status: "past_due" }))
    expect(mockEventBus.emit).toHaveBeenCalledWith([expect.objectContaining({ name: "subscription.payment_failed", data: expect.objectContaining({ reason: "no_card" }) })])
  })

  it("default card set → charges with that card via chargeClient; listCards NOT called", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockChargeClient.chargeSubscription).toHaveBeenCalledWith(expect.objectContaining({ customerId: "op_cust_1", cardId: "card_1" }))
    expect(mockOpenpayClient.listCards).not.toHaveBeenCalled()
  })

  it("chargeSubscription throws → marks past_due and emits payment_failed", async () => {
    mockChargeClient.chargeSubscription.mockRejectedValue(new Error("insufficient funds"))
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ failed: true, reason: "charge_failed" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ id: SUB_ID, status: "past_due" }))
  })

  it("chargeSubscription throws → error message propagated in event", async () => {
    mockChargeClient.chargeSubscription.mockRejectedValue(new Error("insufficient funds"))
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockEventBus.emit).toHaveBeenCalledWith([expect.objectContaining({ name: "subscription.payment_failed", data: expect.objectContaining({ reason: "charge_failed", error: "insufficient funds", amount: 31920 }) })])
  })

  it("happy path → createOrders called with correct currency, customer_id, items", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockOrderService.createOrders).toHaveBeenCalledWith([expect.objectContaining({ currency_code: "mxn", customer_id: "cust_1", email: "luis@test.com", status: "pending", items: [expect.objectContaining({ unit_price: 31920, quantity: 1, variant_id: "var_1" })] })])
  })

  it("happy path → renewal order item metadata includes is_subscription, cycle_number, charge_id, payment_provider", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    const [orderPayload] = mockOrderService.createOrders.mock.calls[0][0]
    expect(orderPayload.items[0].metadata).toMatchObject({ is_subscription: true, cycle_number: 1, charge_id: "ch_1", payment_provider: "pp_openpay" })
  })

  it("happy path → createSubscriptionOrders called with subscription_id, order_id, cycle_number", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.createSubscriptionOrders).toHaveBeenCalledWith([expect.objectContaining({ subscription_id: SUB_ID, order_id: "ord_renewal_1", cycle_number: 1 })])
  })

  it("happy path → next_billing_date advanced by interval_days", async () => {
    const before = new Date()
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    const call = mockSubscriptionService.updateSubscriptions.mock.calls.find((c: any[]) => c[0].next_billing_date)
    expect(call).toBeDefined()
    const nextDate = call[0].next_billing_date as Date
    const expectedMin = new Date(before); expectedMin.setDate(expectedMin.getDate() + 30); expectedMin.setSeconds(expectedMin.getSeconds() - 1)
    const expectedMax = new Date(before); expectedMax.setDate(expectedMax.getDate() + 30); expectedMax.setSeconds(expectedMax.getSeconds() + 1)
    expect(nextDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime())
    expect(nextDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime())
  })

  it("cycle_number = existing subscription_orders.length + 1", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({ ...baseSubscription, subscription_orders: [{ id: "so_1" }, { id: "so_2" }] })
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.createSubscriptionOrders).toHaveBeenCalledWith([expect.objectContaining({ cycle_number: 3 })])
  })

  it("happy path → subscription.renewed event emitted with all required fields", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockEventBus.emit).toHaveBeenCalledWith([expect.objectContaining({ name: "subscription.renewed", data: expect.objectContaining({ subscription_id: SUB_ID, order_id: "ord_renewal_1", cycle_number: 1, amount: 31920, customer_email: "luis@test.com", charge_id: "ch_1", payment_provider: "pp_openpay" }) })])
  })

  it("happy path → returns success with order_id and cycle_number", async () => {
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ success: true, order_id: "ord_renewal_1", cycle_number: 1 })
  })

  it("ENVIA env vars set → enviaCreateFulfillmentWorkflow invoked with renewal order id", async () => {
    process.env.ENVIA_API_TOKEN = "token"
    process.env.ENVIA_API_URL = "https://api.envia.com"
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(enviaCreateFulfillmentWorkflow).toHaveBeenCalled()
    expect(mockEnviaRun).toHaveBeenCalledWith(expect.objectContaining({ input: { orderId: "ord_renewal_1" } }))
  })

  it("Envia workflow throws → error logged but result is still success", async () => {
    process.env.ENVIA_API_TOKEN = "token"
    process.env.ENVIA_API_URL = "https://api.envia.com"
    mockEnviaRun.mockRejectedValue(new Error("Envia down"))
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ success: true, order_id: "ord_renewal_1", cycle_number: 1 })
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Envia fulfillment failed"))
  })

  it("getChargeClient throws → skips with reason provider_not_configured", async () => {
    ;(getChargeClient as jest.Mock).mockImplementation(() => { throw new Error("No charge client configured for provider: pp_unknown") })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID, provider_id: "pp_unknown" })
    expect(result).toEqual({ skipped: true, reason: "provider_not_configured" })
    expect(mockChargeClient.chargeSubscription).not.toHaveBeenCalled()
  })
})
