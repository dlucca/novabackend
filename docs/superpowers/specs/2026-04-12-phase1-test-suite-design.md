# Phase 1 Test Suite — Design Spec

**Date:** 2026-04-12  
**Scope:** Unit tests for the 4 highest-risk areas of the Novapatch backend (billing, subscription state machine, Envia fulfillment, Envia webhook)  
**Target:** ~67 tests across 4 new files

---

## Context

The backend currently has ~15 unit tests covering utilities and basic validation. The 4 areas below have zero meaningful coverage and represent the highest financial/operational risk:

1. `process-billing-step` — charges customers, creates renewal orders
2. Subscription state machine — cancel/pause/resume/update-frequency steps
3. Envia fulfillment workflow — fetch order → generate label → create Medusa fulfillment
4. Envia webhook handler — deduplication, fulfillment lookup, email dispatch

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Test pattern | Inline logic + mock container | Matches existing project pattern; no Medusa runtime needed |
| File organization | One file per area (4 files) | Follows project convention; each concern isolated |
| Webhook testing | Export and test `processEvent` directly | `setImmediate` wrapper is glue code; logic lives in `processEvent` |
| Coverage depth | All happy paths + critical error cases | Phase 1 closes all 4 areas in one pass |

---

## File Structure

```
src/__tests__/
  workflows/
    process-billing.unit.spec.ts              (~25 tests)
    subscription-state-machine.unit.spec.ts   (~20 tests)
    envia-fulfillment.unit.spec.ts            (~12 tests)
  api/
    envia-webhook-process-event.unit.spec.ts  (~10 tests)
```

---

## Shared Patterns

### Container mock factory

Every file defines a `makeContainer(overrides?)` helper that returns a mock Medusa container:

```ts
function makeContainer(overrides: Record<string, any> = {}) {
  const services: Record<string, any> = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    [SUBSCRIPTION_MODULE]: mockSubscriptionService,
    [Modules.ORDER]: mockOrderService,
    [Modules.CUSTOMER]: mockCustomerService,
    [Modules.EVENT_BUS]: mockEventBus,
    [Modules.FULFILLMENT]: mockFulfillmentModule,
    [ContainerRegistrationKeys.QUERY]: mockQuery,
    ...overrides,
  }
  return { resolve: jest.fn((key: string) => services[key] ?? null) }
}
```

### Fixtures

Each file declares shared fixture objects at the top (reset in `beforeEach`):

```ts
const mockSubscription = { id: "sub_1", status: "active", interval_days: 30, ... }
const mockOrder = { id: "ord_1", customer_id: "cust_1", items: [...], ... }
const mockCustomer = { id: "cust_1", email: "x@x.com", metadata: { openpay_customer_id: "op_1" } }
```

### Test naming

`"[area] — [condition] → [expected outcome]"`  
Example: `"process-billing — no openpay_customer_id → marks past_due + emits payment_failed"`

### Running tests

```bash
TEST_TYPE=unit npx jest --testPathPattern=process-billing
TEST_TYPE=unit npx jest --testPathPattern=subscription-state-machine
TEST_TYPE=unit npx jest --testPathPattern=envia-fulfillment
TEST_TYPE=unit npx jest --testPathPattern=envia-webhook
TEST_TYPE=unit npx jest   # all unit tests
```

---

## File 1: `process-billing.unit.spec.ts` (~25 tests)

### Setup

- `OpenpayClient` mocked at module level via `jest.mock(...)`
- `enviaCreateFulfillmentWorkflow` mocked at module level
- Logic extracted as `runBillingLogic(deps, input)` — mirrors the step's inner function, injecting mocked deps

### Test groups

#### Group 1 — Early exits (5 tests)

| Test | Condition | Expected result |
|------|-----------|-----------------|
| status not active | subscription.status = "paused" | `{ skipped: true, reason: "not_active" }` |
| no original_order_id | subscription.original_order_id = null | `{ skipped: true, reason: "no_original_order" }` |
| no subscription line item | order.items has no `is_subscription` metadata | `{ skipped: true, reason: "no_subscription_item" }` |
| no customer_id | order.customer_id = null | `{ skipped: true, reason: "no_customer" }` |
| customer not found | customerService.retrieveCustomer throws | `{ skipped: true, reason: "customer_not_found" }` |

#### Group 2 — No Openpay customer (2 tests)

| Test | Condition | Expected result |
|------|-----------|-----------------|
| no openpay_customer_id | customer.metadata.openpay_customer_id = undefined | status → `past_due`; `subscription.payment_failed` emitted with reason=`no_openpay_customer` |
| event payload correct | same | event data includes subscription_id, customer_email, customer_name |

#### Group 3 — Inventory checks (3 tests)

| Test | Condition | Expected result |
|------|-----------|-----------------|
| out of stock | inventory_quantity = 0, allow_backorder = false | status → `delayed_out_of_stock`; `{ delayed: true, reason: "out_of_stock" }` |
| inventory check throws | query.graph rejects | fail-open: proceeds to billing; warning logged |
| allow_backorder true | inventory_quantity = 0, allow_backorder = true | proceeds to billing (not delayed) |

#### Group 4 — No card available (2 tests)

| Test | Condition | Expected result |
|------|-----------|-----------------|
| no default card + empty vault | no openpay_default_card_id; listCards = [] | status → `past_due`; `payment_failed` emitted with reason=`no_card` |
| uses default card when set | openpay_default_card_id = "card_1" | `chargeCustomerCard` called with source_id="card_1"; listCards NOT called |

#### Group 5 — Charge fails (2 tests)

| Test | Condition | Expected result |
|------|-----------|-----------------|
| chargeCustomerCard throws | Openpay rejects with error | status → `past_due`; `payment_failed` emitted with reason=`charge_failed` + error message |
| error message propagated | error = new Error("insufficient funds") | event data.error = "insufficient funds" |

#### Group 6 — Happy path (7 tests)

| Test | Expected |
|------|----------|
| renewal order created | `orderService.createOrders` called with correct currency, customer_id, items |
| renewal order item has correct metadata | item.metadata includes `is_subscription: true`, `cycle_number`, `openpay_charge_id` |
| SubscriptionOrder record created | `subscriptionService.createSubscriptionOrders` called with subscription_id + order_id + cycle_number |
| next_billing_date advanced | updated date = today + interval_days (±1 second tolerance) |
| cycle_number incremented | existing 2 subscription_orders → cycle_number = 3 |
| `subscription.renewed` event emitted | event data includes order_id, cycle_number, amount, customer_email, next_billing_date |
| returns success | `{ success: true, order_id: renewalOrder.id, cycle_number: N }` |

#### Group 7 — Envia fulfillment (2 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| Envia env vars set | ENVIA_API_TOKEN present | `enviaCreateFulfillmentWorkflow` invoked with orderId = renewalOrder.id |
| Envia workflow fails | workflow throws | error logged; result still `{ success: true }` (best-effort) |

#### Group 8 — Missing Openpay credentials (1 test)

| Test | Condition | Expected |
|------|-----------|----------|
| no env vars | OPENPAY_MERCHANT_ID = "" | `{ skipped: true, reason: "openpay_not_configured" }` |

---

## File 2: `subscription-state-machine.unit.spec.ts` (~20 tests)

### Setup

- Each step's logic extracted as a testable function with injected `subscriptionService` mock
- `makeService(subscription)` helper returns mock service pre-loaded with a fixture subscription
- Steps tested independently (cancel, pause, resume, updateFrequency)

### cancelSubscriptionStep (~5 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| active → canceled | status = "active" | updateSubscriptions called with status="canceled" |
| paused → canceled | status = "paused" | updateSubscriptions called with status="canceled" |
| already canceled | status = "canceled" | throws MedusaError INVALID_DATA "already canceled" |
| compensation restores | compensationData provided | updateSubscriptions called with previous_status + previous_next_billing_date |
| compensation no-ops | compensationData = null | does not call updateSubscriptions |

### pauseSubscriptionStep (~5 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| active → paused | status = "active" | updateSubscriptions called with status="paused" |
| paused → error | status = "paused" | throws INVALID_DATA "Only active subscriptions can be paused" |
| canceled → error | status = "canceled" | throws INVALID_DATA |
| compensation restores | compensationData provided | updateSubscriptions called with previous_status="active" |
| compensation no-ops | compensationData = null | does not call updateSubscriptions |

### resumeSubscriptionStep (~5 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| paused → active | status = "paused" | updateSubscriptions called with status="active" |
| next_billing_date recalculated | interval_days = 30 | new date ≈ today + 30 days (±1s tolerance) |
| active → error | status = "active" | throws INVALID_DATA "Only paused subscriptions can be resumed" |
| compensation restores | compensationData provided | restores previous_status + previous_next_billing_date |
| compensation no-ops | compensationData = null | does not call updateSubscriptions |

### updateFrequencyStep (~5 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| 30 → OK | interval_days = 30 | updateSubscriptions called with interval_days=30 |
| 60 → OK | interval_days = 60 | updateSubscriptions called with interval_days=60 |
| 45 → error | interval_days = 45 | throws INVALID_DATA "must be one of 30, 60, 90" |
| canceled → error | status = "canceled" | throws INVALID_DATA "Cannot change frequency" |
| compensation restores | compensationData provided | updateSubscriptions called with previous_interval_days |

---

## File 3: `envia-fulfillment.unit.spec.ts` (~12 tests)

### Setup

- `EnviaClient` mocked at module level
- `createOrderFulfillmentWorkflow` and `createShipmentWorkflow` mocked at module level
- `getRedisClient` mocked to return a mock Redis instance or null
- Each step tested as an inlined async function receiving mocked deps

### fetchOrderForFulfillmentStep (~2 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| order found | orderService resolves | returns order with items + shipping_address |
| order not found | orderService throws | error propagates |

### generateEnviaLabelStep (~6 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| single carrier succeeds | getRate resolves, generateShipment resolves | returns shipment result |
| cheapest carrier selected | 2 carriers: rates 300 and 100 | generateShipment called with carrier having rate=100 |
| all carriers fail rating | all getRate reject | throws "No shipping rates available" |
| 4xx on generate → fallback | first carrier generateShipment rejects with statusCode=400 | tries second carrier |
| 5xx on generate → re-throws | generateShipment rejects with statusCode=500 | error propagates without fallback |
| compensation cancels label | compensationData = { shipmentId, carrier, trackingNumber } | `client.cancelShipment` called with that data |

### createMedusaFulfillmentStep (~4 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| no MEDUSA_WAREHOUSE_LOCATION_ID | env var not set | throws "MEDUSA_WAREHOUSE_LOCATION_ID is not set" |
| fulfillment created | happy path | `createOrderFulfillmentWorkflow` called with order_id, location_id, items |
| Redis index written | Redis available | `redis.set(TRACKING_KEY_PREFIX + trackingNumber, fulfillment.id)` called |
| Redis fails → non-fatal | redis.set throws | warning logged; step still returns fulfillment.id |

---

## File 4: `envia-webhook-process-event.unit.spec.ts` (~10 tests)

### Setup

- `processEvent` exported from `src/api/webhooks/envia/route.ts` (requires adding `export` to the function — minimal code change)
- `getRedisClient` mocked
- Container built with mocked fulfillmentModule, orderService, eventBus, logger
- Redis mock returns hit/miss per test

### Test groups

#### Fulfillment lookup (~3 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| Redis hit | redis.get returns fulfillmentId | `listFulfillments({ id: fulfillmentId })` called (no full scan) |
| Redis miss → full scan | redis.get returns null | `listFulfillments({})` called; match found by tracking label |
| No fulfillment found | full scan returns empty | warning logged; returns without error |

#### status=in_transit (~2 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| fulfillment has order_id | happy path | `eventBus.emit` called with `novapatch.envia.in_transit` + order_id + fulfillment_id + tracking |
| no order_id in metadata | fulfillment.metadata.order_id = undefined | warning logged; no event emitted; no throw |

#### status=delivered (~1 test)

| Test | Expected |
|------|----------|
| email sent | `renderEmail` called with OrderDelivered component; `sendEmail` called with correct subject |

#### status=failed / returned (~2 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| failed | status="failed" | `renderEmail` called with OrderDeliveryFailed; failureReason from last event |
| returned | status="returned" | same as failed path |

#### Error resilience (~2 tests)

| Test | Condition | Expected |
|------|-----------|----------|
| email send throws | sendEmail rejects | error logged; no throw (webhook never throws) |
| Redis unavailable | getRedisClient returns null | falls back to full scan; continues normally |

---

## Required Code Change

`processEvent` in `src/api/webhooks/envia/route.ts` needs to be exported:

```ts
// Before:
async function processEvent(...) { ... }

// After:
export async function processEvent(...) { ... }
```

This is the only source change needed. The function signature does not change.

---

## Acceptance Criteria

- All 4 files pass `TEST_TYPE=unit npx jest` with no failures
- No test imports Medusa runtime or requires a running database/Redis
- Each test is isolated: `beforeEach` resets all mocks
- Coverage of `processBillingStep` branches: all 8 groups covered
- Coverage of subscription state machine: all 4 steps × happy path + invalid transition + compensation
- The `export` on `processEvent` is the only change to non-test files
