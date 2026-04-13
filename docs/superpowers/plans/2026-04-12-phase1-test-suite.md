# Phase 1 Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write ~67 unit tests covering the 4 highest-risk areas of the backend — billing, subscription state machine, Envia fulfillment, and Envia webhook — with zero Medusa runtime dependencies.

**Architecture:** Each test file inlines the step logic as a testable function with injected mock deps (the pattern established in `process-daily-subscriptions.unit.spec.ts`). All external services (Openpay, Envia, Redis, Resend) are mocked at module level. The only non-test source change is exporting `processEvent` from the Envia webhook handler.

**Tech Stack:** Jest + @swc/jest, TypeScript, `TEST_TYPE=unit npx jest`

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/api/webhooks/envia/route.ts` — add `export` to `processEvent` |
| Create | `src/__tests__/workflows/process-billing.unit.spec.ts` |
| Create | `src/__tests__/workflows/subscription-state-machine.unit.spec.ts` |
| Create | `src/__tests__/workflows/envia-fulfillment.unit.spec.ts` |
| Create | `src/__tests__/api/envia-webhook-process-event.unit.spec.ts` |

---

## Task 1: Export `processEvent` from the Envia webhook handler

**Files:**
- Modify: `src/api/webhooks/envia/route.ts:~line 41`

- [ ] **Step 1: Add `export` keyword to `processEvent`**

Find this line in `src/api/webhooks/envia/route.ts`:
```ts
async function processEvent(
```
Change it to:
```ts
export async function processEvent(
```
Nothing else changes. The function signature, body, and the `POST` handler that calls `setImmediate(() => processEvent(...))` remain identical.

- [ ] **Step 2: Verify the server still compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/webhooks/envia/route.ts
git commit -m "refactor(webhook): export processEvent for unit testing"
```

---

## Task 2: `process-billing.unit.spec.ts`

**Files:**
- Create: `src/__tests__/workflows/process-billing.unit.spec.ts`

The inner function of `processBillingStep` is extracted as `runBillingLogic(deps, input)` in the test file — the same pattern used in `process-daily-subscriptions.unit.spec.ts`. The function body is an exact copy of the step's inner async function from `src/workflows/process-billing-cycle/steps/process-billing.ts`, with all `container.resolve(X)` calls replaced by `deps.X`.

- [ ] **Step 1: Create the test file**

Create `src/__tests__/workflows/process-billing.unit.spec.ts` with this content:

```ts
// src/__tests__/workflows/process-billing.unit.spec.ts
//
// Tests the billing logic that runs nightly to charge subscriptions.
// Pattern: inline the step logic as runBillingLogic(deps, input) and inject
// mocked services — same approach as process-daily-subscriptions.unit.spec.ts.

import { SUBSCRIPTION_MODULE } from "../../modules/subscription"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../modules/openpay-payment/openpay-client"
import { enviaCreateFulfillmentWorkflow } from "../../workflows/envia-create-fulfillment"

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockOpenpayClient = {
  listCards: jest.fn(),
  chargeCustomerCard: jest.fn(),
}
jest.mock("../../modules/openpay-payment/openpay-client", () => ({
  OpenpayClient: jest.fn().mockImplementation(() => mockOpenpayClient),
}))

const mockEnviaRun = jest.fn()
jest.mock("../../workflows/envia-create-fulfillment", () => ({
  enviaCreateFulfillmentWorkflow: jest.fn().mockReturnValue({ run: mockEnviaRun }),
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

const baseCharge = { id: "ch_1", status: "completed" }
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
  }
}

// ── Billing logic (mirrors processBillingStep inner function with injected deps)
// Copy the async handler body from:
//   src/workflows/process-billing-cycle/steps/process-billing.ts
// replacing every `container.resolve(X)` with the matching `deps.X` field.
// Keep the function body identical to the source — do not simplify.
// ─────────────────────────────────────────────────────────────────────────────

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
  input: { subscription_id: string }
): Promise<BillingResult> {
  const { subscriptionService, orderService, customerService, query, eventBus, logger } = deps
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
    return { failed: true, reason: "no_openpay_customer" }
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

  const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
  const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
  const sandbox = process.env.OPENPAY_SANDBOX !== "false"

  if (!merchantId || !privateKey) {
    logger.error(`${LOG} Openpay credentials not configured`)
    return { skipped: true, reason: "openpay_not_configured" }
  }

  const openpayClient = new OpenpayClient({ merchantId, privateKey, sandbox } as any)

  let cardId = customer.metadata?.openpay_default_card_id as string | undefined
  if (!cardId) {
    const cards = await (openpayClient as any).listCards(openpayCustomerId)
    cardId = cards[0]?.id
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

  let charge: any
  try {
    charge = await (openpayClient as any).chargeCustomerCard(openpayCustomerId, {
      source_id: cardId,
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
      openpay_charge_id: charge.id,
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
    mockQuery.graph.mockResolvedValue({
      data: [{ product_variant: { id: "var_1", allow_backorder: false } }],
    })
    mockOpenpayClient.chargeCustomerCard.mockResolvedValue(baseCharge)
    // Default: in-stock (inventory_quantity = 10)
    // Use mockImplementation (not Once) to avoid mock state leakage between tests.
    // The inventory check makes two sequential query.graph calls with different entity values.
    mockQuery.graph.mockImplementation(({ entity }: any) => {
      if (entity === "subscription") {
        return Promise.resolve({ data: [{ product_variant: { id: "var_1", allow_backorder: false } }] })
      }
      return Promise.resolve({ data: [{ id: "var_1", inventory_quantity: 10 }] })
    })
  })

  // ── Group 1: Early exits ────────────────────────────────────────────────────

  it("status not active → skips with reason not_active", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      ...baseSubscription,
      status: "paused",
    })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "not_active" })
    expect(mockOrderService.retrieveOrder).not.toHaveBeenCalled()
  })

  it("no original_order_id → skips with reason no_original_order", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      ...baseSubscription,
      original_order_id: null,
    })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "no_original_order" })
  })

  it("no subscription line item → skips with reason no_subscription_item", async () => {
    mockOrderService.retrieveOrder.mockResolvedValue({
      ...baseOrder,
      items: [{ id: "item_x", metadata: { is_subscription: false } }],
    })
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

  // ── Group 2: No Openpay customer ID ─────────────────────────────────────────

  it("no openpay_customer_id → marks past_due", async () => {
    mockCustomerService.retrieveCustomer.mockResolvedValue({
      ...baseCustomer,
      metadata: {},
    })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ failed: true, reason: "no_openpay_customer" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "past_due" })
    )
  })

  it("no openpay_customer_id → emits payment_failed with correct payload", async () => {
    mockCustomerService.retrieveCustomer.mockResolvedValue({
      ...baseCustomer,
      metadata: {},
    })
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "subscription.payment_failed",
        data: expect.objectContaining({
          subscription_id: SUB_ID,
          reason: "no_openpay_customer",
          customer_email: "luis@test.com",
          customer_name: "Luis Pérez",
        }),
      }),
    ])
  })

  // ── Group 3: Inventory checks ────────────────────────────────────────────────

  it("out of stock → marks delayed_out_of_stock and returns delayed", async () => {
    mockQuery.graph.mockImplementation(({ entity }: any) => {
      if (entity === "subscription") {
        return Promise.resolve({ data: [{ product_variant: { id: "var_1", allow_backorder: false } }] })
      }
      return Promise.resolve({ data: [{ id: "var_1", inventory_quantity: 0 }] })
    })
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ delayed: true, reason: "out_of_stock" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "delayed_out_of_stock" })
    )
    expect(mockOpenpayClient.chargeCustomerCard).not.toHaveBeenCalled()
  })

  it("inventory check throws → fail-open: proceeds with billing", async () => {
    mockQuery.graph.mockRejectedValue(new Error("query timeout"))
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Inventory check failed")
    )
    expect(mockOpenpayClient.chargeCustomerCard).toHaveBeenCalled()
  })

  it("allow_backorder true + inventory 0 → proceeds with billing (not delayed)", async () => {
    mockQuery.graph.mockImplementation(({ entity }: any) => {
      if (entity === "subscription") {
        return Promise.resolve({ data: [{ product_variant: { id: "var_1", allow_backorder: true } }] })
      }
      return Promise.resolve({ data: [{ id: "var_1", inventory_quantity: 0 }] })
    })
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockOpenpayClient.chargeCustomerCard).toHaveBeenCalled()
  })

  // ── Group 4: Card resolution ─────────────────────────────────────────────────

  it("no default card + empty vault → marks past_due and emits payment_failed", async () => {
    mockCustomerService.retrieveCustomer.mockResolvedValue({
      ...baseCustomer,
      metadata: { openpay_customer_id: "op_cust_1" }, // no openpay_default_card_id
    })
    mockOpenpayClient.listCards.mockResolvedValue([])
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ failed: true, reason: "no_card" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "past_due" })
    )
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "subscription.payment_failed",
        data: expect.objectContaining({ reason: "no_card" }),
      }),
    ])
  })

  it("default card set → charges with that card; listCards NOT called", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockOpenpayClient.chargeCustomerCard).toHaveBeenCalledWith(
      "op_cust_1",
      expect.objectContaining({ source_id: "card_1" })
    )
    expect(mockOpenpayClient.listCards).not.toHaveBeenCalled()
  })

  // ── Group 5: Charge fails ────────────────────────────────────────────────────

  it("chargeCustomerCard throws → marks past_due and emits payment_failed", async () => {
    mockOpenpayClient.chargeCustomerCard.mockRejectedValue(new Error("insufficient funds"))
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ failed: true, reason: "charge_failed" })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "past_due" })
    )
  })

  it("chargeCustomerCard throws → error message propagated in event", async () => {
    mockOpenpayClient.chargeCustomerCard.mockRejectedValue(new Error("insufficient funds"))
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "subscription.payment_failed",
        data: expect.objectContaining({
          reason: "charge_failed",
          error: "insufficient funds",
          amount: 31920,
        }),
      }),
    ])
  })

  // ── Group 6: Happy path ──────────────────────────────────────────────────────

  it("happy path → createOrders called with correct currency, customer_id, items", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockOrderService.createOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        currency_code: "mxn",
        customer_id: "cust_1",
        email: "luis@test.com",
        status: "pending",
        items: [
          expect.objectContaining({
            unit_price: 31920,
            quantity: 1,
            variant_id: "var_1",
          }),
        ],
      }),
    ])
  })

  it("happy path → renewal order item metadata includes is_subscription, cycle_number, openpay_charge_id", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    const [orderPayload] = mockOrderService.createOrders.mock.calls[0][0]
    expect(orderPayload.items[0].metadata).toMatchObject({
      is_subscription: true,
      cycle_number: 1,
      openpay_charge_id: "ch_1",
    })
  })

  it("happy path → createSubscriptionOrders called with subscription_id, order_id, cycle_number", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.createSubscriptionOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        subscription_id: SUB_ID,
        order_id: "ord_renewal_1",
        cycle_number: 1,
      }),
    ])
  })

  it("happy path → next_billing_date advanced by interval_days", async () => {
    const before = new Date()
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    const call = mockSubscriptionService.updateSubscriptions.mock.calls.find(
      (c: any[]) => c[0].next_billing_date
    )
    expect(call).toBeDefined()
    const nextDate = call[0].next_billing_date as Date
    const expectedMin = new Date(before)
    expectedMin.setDate(expectedMin.getDate() + 30)
    expectedMin.setSeconds(expectedMin.getSeconds() - 1)
    const expectedMax = new Date(before)
    expectedMax.setDate(expectedMax.getDate() + 30)
    expectedMax.setSeconds(expectedMax.getSeconds() + 1)
    expect(nextDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime())
    expect(nextDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime())
  })

  it("cycle_number = existing subscription_orders.length + 1", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      ...baseSubscription,
      subscription_orders: [{ id: "so_1" }, { id: "so_2" }], // 2 existing
    })
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.createSubscriptionOrders).toHaveBeenCalledWith([
      expect.objectContaining({ cycle_number: 3 }),
    ])
  })

  it("happy path → subscription.renewed event emitted with all required fields", async () => {
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "subscription.renewed",
        data: expect.objectContaining({
          subscription_id: SUB_ID,
          order_id: "ord_renewal_1",
          cycle_number: 1,
          amount: 31920,
          customer_email: "luis@test.com",
          openpay_charge_id: "ch_1",
        }),
      }),
    ])
  })

  it("happy path → returns success with order_id and cycle_number", async () => {
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ success: true, order_id: "ord_renewal_1", cycle_number: 1 })
  })

  // ── Group 7: Envia fulfillment ───────────────────────────────────────────────

  it("ENVIA env vars set → enviaCreateFulfillmentWorkflow invoked with renewal order id", async () => {
    process.env.ENVIA_API_TOKEN = "token"
    process.env.ENVIA_API_URL = "https://api.envia.com"
    await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(enviaCreateFulfillmentWorkflow).toHaveBeenCalled()
    expect(mockEnviaRun).toHaveBeenCalledWith(
      expect.objectContaining({ input: { orderId: "ord_renewal_1" } })
    )
  })

  it("Envia workflow throws → error logged but result is still success", async () => {
    process.env.ENVIA_API_TOKEN = "token"
    process.env.ENVIA_API_URL = "https://api.envia.com"
    mockEnviaRun.mockRejectedValue(new Error("Envia down"))
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ success: true, order_id: "ord_renewal_1", cycle_number: 1 })
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Envia fulfillment failed"))
  })

  // ── Group 8: Missing Openpay credentials ────────────────────────────────────

  it("OPENPAY_MERCHANT_ID empty → skips with reason openpay_not_configured", async () => {
    process.env.OPENPAY_MERCHANT_ID = ""
    const result = await runBillingLogic(makeDeps(), { subscription_id: SUB_ID })
    expect(result).toEqual({ skipped: true, reason: "openpay_not_configured" })
    expect(mockOpenpayClient.chargeCustomerCard).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
TEST_TYPE=unit npx jest --testPathPattern=process-billing --no-coverage
```

Expected: all 25 tests PASS. If a test fails with "Cannot read properties of undefined", check that the `mockQuery.graph.mockImplementation` in `beforeEach` dispatches on `entity` correctly — the inventory check makes two calls with `entity="subscription"` and `entity="product_variant"` respectively.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/workflows/process-billing.unit.spec.ts
git commit -m "test(billing): 25 unit tests for processBillingStep — all branches covered"
```

---

## Task 3: `subscription-state-machine.unit.spec.ts`

**Files:**
- Create: `src/__tests__/workflows/subscription-state-machine.unit.spec.ts`

- [ ] **Step 1: Create the test file**

```ts
// src/__tests__/workflows/subscription-state-machine.unit.spec.ts
//
// Tests for cancel, pause, resume, and update-frequency steps.
// Each step's logic is inlined as a function accepting the subscription service.

import { MedusaError } from "@medusajs/framework/utils"

// ── Service mock ──────────────────────────────────────────────────────────────

const mockSubscriptionService = {
  retrieveSubscription: jest.fn(),
  updateSubscriptions: jest.fn(),
}

function makeService() {
  return mockSubscriptionService
}

// ── Step logic (mirroring each step's inner function with injected service) ──
// Source: src/workflows/*/steps/*.ts
// Replace container.resolve(SUBSCRIPTION_MODULE) with the injected service param.

// cancelSubscriptionStep
async function runCancel(service: typeof mockSubscriptionService, input: { subscription_id: string }) {
  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status === "canceled") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Subscription is already canceled")
  }

  const previousStatus = subscription.status
  const previousNextBillingDate = subscription.next_billing_date

  await service.updateSubscriptions({ id: input.subscription_id, status: "canceled" })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    compensationData: {
      subscription_id: input.subscription_id,
      previous_status: previousStatus,
      previous_next_billing_date: previousNextBillingDate,
    },
  }
}

async function runCancelCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_status: string; previous_next_billing_date: any } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    status: compensationData.previous_status,
    next_billing_date: compensationData.previous_next_billing_date,
  })
}

// pauseSubscriptionStep
async function runPause(service: typeof mockSubscriptionService, input: { subscription_id: string }) {
  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status !== "active") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Only active subscriptions can be paused. Current status: ${subscription.status}`
    )
  }

  const previousStatus = subscription.status
  await service.updateSubscriptions({ id: input.subscription_id, status: "paused" })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    compensationData: { subscription_id: input.subscription_id, previous_status: previousStatus },
  }
}

async function runPauseCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_status: string } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    status: compensationData.previous_status,
  })
}

// resumeSubscriptionStep
async function runResume(service: typeof mockSubscriptionService, input: { subscription_id: string }) {
  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status !== "paused") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Only paused subscriptions can be resumed. Current status: ${subscription.status}`
    )
  }

  const previousStatus = subscription.status
  const previousNextBillingDate = subscription.next_billing_date

  const newNextBillingDate = new Date()
  newNextBillingDate.setDate(newNextBillingDate.getDate() + subscription.interval_days)

  await service.updateSubscriptions({
    id: input.subscription_id,
    status: "active",
    next_billing_date: newNextBillingDate,
  })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    newNextBillingDate,
    compensationData: {
      subscription_id: input.subscription_id,
      previous_status: previousStatus,
      previous_next_billing_date: previousNextBillingDate,
    },
  }
}

async function runResumeCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_status: string; previous_next_billing_date: any } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    status: compensationData.previous_status,
    next_billing_date: compensationData.previous_next_billing_date,
  })
}

// updateFrequencyStep
const VALID_INTERVALS = [30, 60, 90]

async function runUpdateFrequency(
  service: typeof mockSubscriptionService,
  input: { subscription_id: string; interval_days: number }
) {
  if (!VALID_INTERVALS.includes(input.interval_days)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `interval_days must be one of ${VALID_INTERVALS.join(", ")}. Received: ${input.interval_days}`
    )
  }

  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status !== "active" && subscription.status !== "paused") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Cannot change frequency on a subscription with status: ${subscription.status}. Must be active or paused.`
    )
  }

  const previousIntervalDays = subscription.interval_days
  await service.updateSubscriptions({ id: input.subscription_id, interval_days: input.interval_days })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    compensationData: { subscription_id: input.subscription_id, previous_interval_days: previousIntervalDays },
  }
}

async function runUpdateFrequencyCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_interval_days: number } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    interval_days: compensationData.previous_interval_days,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const SUB_ID = "sub_1"

describe("cancelSubscriptionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID,
      status: "active",
      next_billing_date: new Date("2026-05-01"),
      interval_days: 30,
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("active → calls updateSubscriptions with status canceled", async () => {
    await runCancel(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "canceled" })
    )
  })

  it("paused → calls updateSubscriptions with status canceled", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "paused", next_billing_date: new Date("2026-05-01"), interval_days: 30,
    })
    await runCancel(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    )
  })

  it("already canceled → throws MedusaError INVALID_DATA", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "canceled", interval_days: 30,
    })
    await expect(runCancel(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Subscription is already canceled"
    )
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })

  it("compensation → restores previous_status and previous_next_billing_date", async () => {
    const prevDate = new Date("2026-04-15")
    await runCancelCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_status: "active",
      previous_next_billing_date: prevDate,
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      status: "active",
      next_billing_date: prevDate,
    })
  })

  it("compensation with null → does not call updateSubscriptions", async () => {
    await runCancelCompensation(makeService(), null)
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })
})

describe("pauseSubscriptionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "active", interval_days: 30,
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("active → calls updateSubscriptions with status paused", async () => {
    await runPause(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "paused" })
    )
  })

  it("paused → throws INVALID_DATA (only active can be paused)", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "paused", interval_days: 30,
    })
    await expect(runPause(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Only active subscriptions can be paused"
    )
  })

  it("canceled → throws INVALID_DATA", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "canceled", interval_days: 30,
    })
    await expect(runPause(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Only active subscriptions can be paused"
    )
  })

  it("compensation → restores previous_status", async () => {
    await runPauseCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_status: "active",
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      status: "active",
    })
  })

  it("compensation with null → does not call updateSubscriptions", async () => {
    await runPauseCompensation(makeService(), null)
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })
})

describe("resumeSubscriptionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID,
      status: "paused",
      interval_days: 30,
      next_billing_date: new Date("2026-03-01"),
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("paused → calls updateSubscriptions with status active", async () => {
    await runResume(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "active" })
    )
  })

  it("paused → next_billing_date = today + interval_days", async () => {
    const before = new Date()
    const { newNextBillingDate } = await runResume(makeService(), { subscription_id: SUB_ID })
    const expectedMin = new Date(before)
    expectedMin.setDate(expectedMin.getDate() + 30)
    expectedMin.setSeconds(expectedMin.getSeconds() - 1)
    const expectedMax = new Date(before)
    expectedMax.setDate(expectedMax.getDate() + 30)
    expectedMax.setSeconds(expectedMax.getSeconds() + 1)
    expect(newNextBillingDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime())
    expect(newNextBillingDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime())
  })

  it("active → throws INVALID_DATA (only paused can be resumed)", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "active", interval_days: 30,
    })
    await expect(runResume(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Only paused subscriptions can be resumed"
    )
  })

  it("compensation → restores previous_status and previous_next_billing_date", async () => {
    const prevDate = new Date("2026-03-01")
    await runResumeCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_status: "paused",
      previous_next_billing_date: prevDate,
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      status: "paused",
      next_billing_date: prevDate,
    })
  })

  it("compensation with null → does not call updateSubscriptions", async () => {
    await runResumeCompensation(makeService(), null)
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })
})

describe("updateFrequencyStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "active", interval_days: 30,
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("interval_days=30 → calls updateSubscriptions with interval_days=30", async () => {
    await runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 30 })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, interval_days: 30 })
    )
  })

  it("interval_days=60 → calls updateSubscriptions with interval_days=60", async () => {
    await runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 60 })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ interval_days: 60 })
    )
  })

  it("interval_days=45 → throws INVALID_DATA", async () => {
    await expect(
      runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 45 })
    ).rejects.toThrow("interval_days must be one of 30, 60, 90")
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })

  it("canceled subscription → throws INVALID_DATA", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "canceled", interval_days: 30,
    })
    await expect(
      runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 60 })
    ).rejects.toThrow("Cannot change frequency")
  })

  it("compensation → restores previous_interval_days", async () => {
    await runUpdateFrequencyCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_interval_days: 30,
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      interval_days: 30,
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
TEST_TYPE=unit npx jest --testPathPattern=subscription-state-machine --no-coverage
```

Expected: 20 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/workflows/subscription-state-machine.unit.spec.ts
git commit -m "test(subscriptions): 20 unit tests for cancel/pause/resume/update-frequency steps"
```

---

## Task 4: `envia-fulfillment.unit.spec.ts`

**Files:**
- Create: `src/__tests__/workflows/envia-fulfillment.unit.spec.ts`

- [ ] **Step 1: Create the test file**

```ts
// src/__tests__/workflows/envia-fulfillment.unit.spec.ts

import { TRACKING_KEY_PREFIX } from "../../lib/redis"

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockEnviaClientInstance = {
  getRate: jest.fn(),
  generateShipment: jest.fn(),
  cancelShipment: jest.fn(),
}
jest.mock("../../lib/envia-client", () => ({
  EnviaClient: jest.fn().mockImplementation(() => mockEnviaClientInstance),
}))

jest.mock("../../lib/envia-mappers", () => ({
  mapAddress: jest.fn().mockReturnValue({
    name: "Luis Pérez", phone: "+525511111111",
    street: "Insurgentes Sur", number: "2000",
    city: "CDMX", state: "DIF", country: "MX", postalCode: "03100",
  }),
  buildShipmentRequest: jest.fn().mockReturnValue({ shipment: { type: 1 } }),
}))

const mockFulfillmentId = "ful_1"
const mockCreateFulfillmentRun = jest.fn().mockResolvedValue({
  result: { id: mockFulfillmentId },
})
const mockCreateShipmentRun = jest.fn().mockResolvedValue(undefined)

jest.mock("@medusajs/medusa/core-flows", () => ({
  createOrderFulfillmentWorkflow: jest.fn().mockReturnValue({ run: mockCreateFulfillmentRun }),
  createShipmentWorkflow: jest.fn().mockReturnValue({ run: mockCreateShipmentRun }),
}))

const mockRedis = { set: jest.fn().mockResolvedValue("OK") }
jest.mock("../../lib/redis", () => ({
  getRedisClient: jest.fn().mockReturnValue(mockRedis),
  TRACKING_KEY_PREFIX: "envia:tracking:",
  TRACKING_KEY_TTL_SECONDS: 2592000,
}))

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockOrderService = { retrieveOrder: jest.fn() }
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function makeContainer() {
  const { Modules } = require("@medusajs/framework/utils")
  return {
    resolve: jest.fn((key: string) => {
      if (key === Modules.ORDER) return mockOrderService
      if (key === "logger") return mockLogger
      return null
    }),
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseOrder = {
  id: "ord_1",
  items: [{ id: "item_1", quantity: 1 }],
  shipping_address: {
    first_name: "Luis", last_name: "Pérez",
    address_1: "Insurgentes Sur 2000",
    city: "CDMX", province: "CMX", country_code: "mx", postal_code: "03100",
  },
}

const baseShipment = {
  shipmentId: 12345,
  trackingNumber: "1Z999AA10123456784",
  carrier: "ups",
  service: "saver",
  totalPrice: "100.00",
  currency: "MXN",
  label: "https://envia.com/label.pdf",
  trackUrl: "https://envia.com/track/1Z999AA10123456784",
}

const baseRate = {
  carrier: "ups",
  service: "saver",
  totalPrice: "100.00",
  currency: "MXN",
}

// ── fetchOrderForFulfillmentStep logic ────────────────────────────────────────

async function runFetchOrder(container: any, input: { orderId: string }) {
  const { Modules } = require("@medusajs/framework/utils")
  const orderService = container.resolve(Modules.ORDER)
  return orderService.retrieveOrder(input.orderId, {
    relations: ["items", "shipping_address"],
  })
}

// ── generateEnviaLabelStep logic ──────────────────────────────────────────────

async function runGenerateLabel(container: any, input: { order: any }) {
  const { EnviaClient } = require("../../lib/envia-client")
  const { mapAddress, buildShipmentRequest } = require("../../lib/envia-mappers")
  const logger = container.resolve("logger")

  const client = new EnviaClient()
  const destination = mapAddress(input.order.shipping_address)
  const items = input.order.items ?? []

  const carriersToQuote = (process.env.ENVIA_CARRIERS ?? "ups,dhl")
    .split(",").map((c: string) => c.trim()).filter(Boolean)

  const rateSettled = await Promise.allSettled(
    carriersToQuote.map((carrier: string) =>
      client.getRate(buildShipmentRequest(destination, items, { carrier }))
    )
  )

  rateSettled.forEach((result: any, i: number) => {
    if (result.status === "rejected") {
      logger.warn(`[envia] Rate failed for "${carriersToQuote[i]}": ${result.reason?.message}`)
    }
  })

  const sortedRates = (rateSettled as any[])
    .filter((r: any) => r.status === "fulfilled" && r.value !== null)
    .map((r: any) => r.value)
    .sort((a: any, b: any) => parseFloat(a.totalPrice) - parseFloat(b.totalPrice))

  if (sortedRates.length === 0) {
    throw new Error(`No shipping rates available for order ${input.order.id}`)
  }

  let shipment: any = null
  for (const rate of sortedRates) {
    try {
      shipment = await client.generateShipment(
        buildShipmentRequest(destination, items, { carrier: rate.carrier, service: rate.service })
      )
      break
    } catch (err: any) {
      if (err.statusCode !== undefined && err.statusCode >= 500) throw err
      logger.warn(`[envia] Generate failed for "${rate.carrier}": ${err.message}`)
    }
  }

  if (!shipment) throw new Error(`All carriers failed label generation for order ${input.order.id}`)

  return {
    shipment,
    compensationData: {
      shipmentId: shipment.shipmentId,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    },
  }
}

async function runGenerateLabelCompensation(container: any, compensationData: any) {
  if (!compensationData) return
  const { EnviaClient } = require("../../lib/envia-client")
  const logger = container.resolve("logger")
  try {
    const client = new EnviaClient()
    await client.cancelShipment(compensationData)
    logger.info(`[envia] Shipment ${compensationData.shipmentId} cancelled`)
  } catch (err: any) {
    logger.error(`[envia] Could not cancel shipment ${compensationData.shipmentId}: ${err.message}`)
  }
}

// ── createMedusaFulfillmentStep logic ─────────────────────────────────────────

async function runCreateFulfillment(container: any, input: { order: any; shipment: any }) {
  const { createOrderFulfillmentWorkflow, createShipmentWorkflow } = require("@medusajs/medusa/core-flows")
  const { getRedisClient, TRACKING_KEY_PREFIX, TRACKING_KEY_TTL_SECONDS } = require("../../lib/redis")
  const logger = container.resolve("logger")

  const locationId = process.env.MEDUSA_WAREHOUSE_LOCATION_ID
  if (!locationId) {
    throw new Error("MEDUSA_WAREHOUSE_LOCATION_ID is not set — cannot register fulfillment in Medusa")
  }

  const { result: fulfillment } = await createOrderFulfillmentWorkflow(container).run({
    input: {
      order_id: input.order.id,
      location_id: locationId,
      items: input.order.items.map((item: any) => ({ id: item.id, quantity: item.quantity })),
      metadata: {
        order_id: input.order.id,
        envia_shipment_id: String(input.shipment.shipmentId),
        envia_track_url: input.shipment.trackUrl,
        envia_label_url: input.shipment.label,
        carrier: input.shipment.carrier,
        service: input.shipment.service,
      },
    },
  })

  try {
    const redis = getRedisClient()
    if (redis) {
      await redis.set(
        `${TRACKING_KEY_PREFIX}${input.shipment.trackingNumber}`,
        fulfillment.id,
        "EX",
        TRACKING_KEY_TTL_SECONDS
      )
    }
  } catch (redisErr: any) {
    logger.warn(`[envia] Failed to write Redis tracking index: ${redisErr.message}`)
  }

  await createShipmentWorkflow(container).run({
    input: {
      id: fulfillment.id,
      labels: [{
        tracking_number: input.shipment.trackingNumber,
        tracking_url: input.shipment.trackUrl,
        label_url: input.shipment.label,
      }],
    },
  })

  return fulfillment.id
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchOrderForFulfillmentStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
  })

  it("order found → returns order with items and shipping_address", async () => {
    const result = await runFetchOrder(makeContainer(), { orderId: "ord_1" })
    expect(result).toEqual(baseOrder)
    expect(mockOrderService.retrieveOrder).toHaveBeenCalledWith("ord_1", {
      relations: ["items", "shipping_address"],
    })
  })

  it("order not found → error propagates", async () => {
    mockOrderService.retrieveOrder.mockRejectedValue(new Error("Order not found"))
    await expect(runFetchOrder(makeContainer(), { orderId: "bad_id" })).rejects.toThrow("Order not found")
  })
})

describe("generateEnviaLabelStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ENVIA_CARRIERS = "ups,dhl"
    mockEnviaClientInstance.getRate.mockResolvedValue(baseRate)
    mockEnviaClientInstance.generateShipment.mockResolvedValue(baseShipment)
    mockEnviaClientInstance.cancelShipment.mockResolvedValue(undefined)
  })

  it("single carrier succeeds → returns shipment result", async () => {
    process.env.ENVIA_CARRIERS = "ups"
    const { shipment } = await runGenerateLabel(makeContainer(), { order: baseOrder })
    expect(shipment).toEqual(baseShipment)
  })

  it("cheapest carrier selected when two carriers return rates", async () => {
    process.env.ENVIA_CARRIERS = "dhl,ups"
    mockEnviaClientInstance.getRate
      .mockResolvedValueOnce({ carrier: "dhl", service: "ground", totalPrice: "300.00", currency: "MXN" })
      .mockResolvedValueOnce({ carrier: "ups", service: "saver", totalPrice: "100.00", currency: "MXN" })
    await runGenerateLabel(makeContainer(), { order: baseOrder })
    const { buildShipmentRequest } = require("../../lib/envia-mappers")
    const lastCall = (mockEnviaClientInstance.generateShipment.mock.calls[0][0] as any)
    // buildShipmentRequest is called with the cheapest carrier (ups)
    expect(buildShipmentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ carrier: "ups" })
    )
  })

  it("all carriers fail rating → throws 'No shipping rates available'", async () => {
    mockEnviaClientInstance.getRate.mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(runGenerateLabel(makeContainer(), { order: baseOrder })).rejects.toThrow(
      "No shipping rates available"
    )
  })

  it("4xx on generate → falls back to next carrier", async () => {
    process.env.ENVIA_CARRIERS = "dhl,ups"
    mockEnviaClientInstance.getRate
      .mockResolvedValueOnce({ carrier: "dhl", service: "ground", totalPrice: "100.00", currency: "MXN" })
      .mockResolvedValueOnce({ carrier: "ups", service: "saver", totalPrice: "200.00", currency: "MXN" })
    const err400 = Object.assign(new Error("Bad request"), { statusCode: 400 })
    mockEnviaClientInstance.generateShipment
      .mockRejectedValueOnce(err400)
      .mockResolvedValueOnce({ ...baseShipment, carrier: "ups" })
    const { shipment } = await runGenerateLabel(makeContainer(), { order: baseOrder })
    expect(shipment.carrier).toBe("ups")
  })

  it("5xx on generate → re-throws without fallback", async () => {
    process.env.ENVIA_CARRIERS = "ups,dhl"
    const err500 = Object.assign(new Error("Internal Server Error"), { statusCode: 500 })
    mockEnviaClientInstance.generateShipment.mockRejectedValue(err500)
    await expect(runGenerateLabel(makeContainer(), { order: baseOrder })).rejects.toThrow(
      "Internal Server Error"
    )
    expect(mockEnviaClientInstance.generateShipment).toHaveBeenCalledTimes(1)
  })

  it("compensation → calls cancelShipment with shipmentId", async () => {
    const compensationData = { shipmentId: 12345, carrier: "ups", trackingNumber: "1Z999" }
    await runGenerateLabelCompensation(makeContainer(), compensationData)
    expect(mockEnviaClientInstance.cancelShipment).toHaveBeenCalledWith(compensationData)
  })
})

describe("createMedusaFulfillmentStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.MEDUSA_WAREHOUSE_LOCATION_ID = "loc_1"
    mockCreateFulfillmentRun.mockResolvedValue({ result: { id: mockFulfillmentId } })
    mockCreateShipmentRun.mockResolvedValue(undefined)
    mockRedis.set.mockResolvedValue("OK")
  })

  it("no MEDUSA_WAREHOUSE_LOCATION_ID → throws", async () => {
    delete process.env.MEDUSA_WAREHOUSE_LOCATION_ID
    await expect(
      runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    ).rejects.toThrow("MEDUSA_WAREHOUSE_LOCATION_ID is not set")
  })

  it("happy path → createOrderFulfillmentWorkflow called with order_id, location_id, items", async () => {
    await runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    expect(mockCreateFulfillmentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          order_id: "ord_1",
          location_id: "loc_1",
          items: [{ id: "item_1", quantity: 1 }],
        }),
      })
    )
  })

  it("Redis index written with tracking number → fulfillment id", async () => {
    await runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    expect(mockRedis.set).toHaveBeenCalledWith(
      `${TRACKING_KEY_PREFIX}${baseShipment.trackingNumber}`,
      mockFulfillmentId,
      "EX",
      expect.any(Number)
    )
  })

  it("Redis throws → warning logged; fulfillment id still returned", async () => {
    mockRedis.set.mockRejectedValue(new Error("Redis connection lost"))
    const result = await runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    expect(result).toBe(mockFulfillmentId)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write Redis tracking index")
    )
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
TEST_TYPE=unit npx jest --testPathPattern=envia-fulfillment --no-coverage
```

Expected: 12 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/workflows/envia-fulfillment.unit.spec.ts
git commit -m "test(fulfillment): 12 unit tests for fetchOrder, generateLabel, createFulfillment steps"
```

---

## Task 5: `envia-webhook-process-event.unit.spec.ts`

**Files:**
- Create: `src/__tests__/api/envia-webhook-process-event.unit.spec.ts`

Prerequisite: Task 1 (export `processEvent`) must be done first.

- [ ] **Step 1: Create the test file**

```ts
// src/__tests__/api/envia-webhook-process-event.unit.spec.ts

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
}
jest.mock("../../lib/redis", () => ({
  getRedisClient: jest.fn().mockReturnValue(mockRedis),
  TRACKING_KEY_PREFIX: "envia:tracking:",
  TRACKING_KEY_TTL_SECONDS: 2592000,
}))

const mockRenderEmail = jest.fn().mockResolvedValue("<html>email</html>")
const mockSendEmail = jest.fn().mockResolvedValue(undefined)
jest.mock("../../lib/resend", () => ({
  renderEmail: mockRenderEmail,
  sendEmail: mockSendEmail,
}))

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockFulfillmentModule = {
  listFulfillments: jest.fn(),
  updateFulfillment: jest.fn(),
}
const mockOrderService = { retrieveOrder: jest.fn() }
const mockEventBus = { emit: jest.fn() }
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function makeContainer() {
  const { Modules } = require("@medusajs/framework/utils")
  const services: Record<string, any> = {
    [Modules.FULFILLMENT]: mockFulfillmentModule,
    [Modules.ORDER]: mockOrderService,
    [Modules.EVENT_BUS]: mockEventBus,
    logger: mockLogger,
  }
  return { resolve: jest.fn((key: string) => services[key] ?? null) }
}

// ── Import processEvent (exported in Task 1) ──────────────────────────────────

import { processEvent } from "../../api/webhooks/envia/route"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TRACKING = "1Z999AA10123456784"
const FULFILLMENT_ID = "ful_1"
const ORDER_ID = "ord_1"

const baseFulfillment = {
  id: FULFILLMENT_ID,
  metadata: { order_id: ORDER_ID },
  labels: [{ tracking_number: TRACKING }],
}

const baseOrder = {
  id: ORDER_ID,
  email: "luis@test.com",
  display_id: "1001",
  shipping_address: { first_name: "Luis" },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("processEvent — fulfillment lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    mockEventBus.emit.mockResolvedValue(undefined)
  })

  it("Redis hit → listFulfillments called with fulfillmentId (no full scan)", async () => {
    mockRedis.get.mockResolvedValue(FULFILLMENT_ID)
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledWith(
      { id: FULFILLMENT_ID },
      expect.objectContaining({ relations: ["labels"] })
    )
    // Should not have been called a second time (no full scan)
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledTimes(1)
  })

  it("Redis miss → full scan called (listFulfillments with empty filter)", async () => {
    mockRedis.get.mockResolvedValue(null)
    mockFulfillmentModule.listFulfillments
      .mockResolvedValueOnce([]) // Redis hit attempt returns empty (miss treated as no match)
      .mockResolvedValueOnce([baseFulfillment]) // full scan
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ relations: ["labels"] })
    )
  })

  it("no fulfillment found → warning logged; no throw", async () => {
    mockRedis.get.mockResolvedValue(null)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([])
    await expect(
      processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    ).resolves.toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`No fulfillment found for tracking ${TRACKING}`)
    )
  })
})

describe("processEvent — status=in_transit", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    mockEventBus.emit.mockResolvedValue(undefined)
  })

  it("emits novapatch.envia.in_transit with order_id, fulfillment_id, tracking_number", async () => {
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "novapatch.envia.in_transit",
        data: expect.objectContaining({
          order_id: ORDER_ID,
          fulfillment_id: FULFILLMENT_ID,
          tracking_number: TRACKING,
        }),
      }),
    ])
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("no order_id in fulfillment metadata → warning logged; no event emitted; no throw", async () => {
    mockFulfillmentModule.listFulfillments.mockResolvedValue([
      { ...baseFulfillment, metadata: {} }, // no order_id
    ])
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("No order_id in fulfillment metadata")
    )
    expect(mockEventBus.emit).not.toHaveBeenCalled()
  })
})

describe("processEvent — status=delivered", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    mockSendEmail.mockResolvedValue(undefined)
    mockRenderEmail.mockResolvedValue("<html>delivered</html>")
  })

  it("renderEmail called with OrderDelivered; sendEmail called with correct subject", async () => {
    await processEvent({ trackingNumber: TRACKING, status: "delivered" }, makeContainer())
    expect(mockRenderEmail).toHaveBeenCalled()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "luis@test.com",
        subject: expect.stringContaining("fue entregado"),
        html: "<html>delivered</html>",
      })
    )
  })
})

describe("processEvent — status=failed / returned", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    mockSendEmail.mockResolvedValue(undefined)
    mockRenderEmail.mockResolvedValue("<html>failed</html>")
  })

  it("status=failed → renderEmail called with failure reason from last event", async () => {
    await processEvent(
      {
        trackingNumber: TRACKING,
        status: "failed",
        events: [
          { timestamp: "2026-04-01T10:00:00Z", description: "Address not found" },
          { timestamp: "2026-04-01T12:00:00Z", description: "Delivery attempt failed" },
        ],
      },
      makeContainer()
    )
    expect(mockRenderEmail).toHaveBeenCalled()
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Problema con la entrega") })
    )
  })

  it("status=returned → sendEmail called (same path as failed)", async () => {
    await processEvent({ trackingNumber: TRACKING, status: "returned" }, makeContainer())
    expect(mockSendEmail).toHaveBeenCalled()
  })
})

describe("processEvent — error resilience", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
  })

  it("sendEmail throws → error logged; processEvent does not throw", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend API down"))
    mockRenderEmail.mockResolvedValue("<html>delivered</html>")
    await expect(
      processEvent({ trackingNumber: TRACKING, status: "delivered" }, makeContainer())
    ).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send delivered email")
    )
  })

  it("Redis unavailable → falls back to full scan; continues normally", async () => {
    const { getRedisClient } = require("../../lib/redis")
    ;(getRedisClient as jest.Mock).mockReturnValueOnce(null)
    mockEventBus.emit.mockResolvedValue(undefined)
    await expect(
      processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    ).resolves.toBeUndefined()
    // Full scan was used (no Redis)
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ relations: ["labels"] })
    )
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
TEST_TYPE=unit npx jest --testPathPattern=envia-webhook-process-event --no-coverage
```

Expected: 10 tests PASS. If you see `SyntaxError: The requested module '../../api/webhooks/envia/route' does not provide an export named 'processEvent'`, verify Task 1 was completed (the `export` keyword was added).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/api/envia-webhook-process-event.unit.spec.ts
git commit -m "test(webhook): 10 unit tests for processEvent — lookup, in_transit, delivered, failed, resilience"
```

---

## Task 6: Full run and verification

- [ ] **Step 1: Run the full unit test suite**

```bash
TEST_TYPE=unit npx jest --no-coverage
```

Expected output (approximately):
```
Test Suites: 15 passed, 15 total
Tests:       82 passed, 82 total  (15 existing + 67 new)
Snapshots:   0 total
Time:        ~5s
```

- [ ] **Step 2: Verify no test imports Medusa runtime**

```bash
grep -r "medusa develop\|MedusaApp\|startMedusa" src/__tests__/workflows/ src/__tests__/api/envia-webhook-process-event.unit.spec.ts
```

Expected: no matches.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "test: Phase 1 test suite complete — 67 unit tests for billing, state machine, fulfillment, webhook"
```
