# Argentina Etapa 3 — Multi-Region Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `processBillingCycle` workflow and daily subscription job provider-agnostic, routing each charge to Openpay (MX) or MercadoPago (AR) based on the subscription's original order.

**Architecture:** Three changes: (1) a new `PaymentProviderRouter` utility that resolves a unified `ChargeClient` by `provider_id`, (2) a new `resolve-payment-provider` step that reads the provider from the original order's payment collection, and (3) `process-billing.ts` is updated to use the router instead of importing `OpenpayClient` directly. The cron schedule shifts from `0 6 * * *` to `0 3 * * *` to cover midnight ART without breaking MX.

**Tech Stack:** Medusa.js v2 workflows, OpenpayClient, MercadoPagoClient, Jest

---

## File Map

| File | Action |
|------|--------|
| `src/lib/payment-provider-router.ts` | Create |
| `src/workflows/process-billing-cycle/steps/resolve-payment-provider.ts` | Create |
| `src/workflows/process-billing-cycle/steps/process-billing.ts` | Modify |
| `src/workflows/process-billing-cycle/index.ts` | Modify |
| `src/jobs/process-daily-subscriptions.ts` | Modify — cron schedule only |

---

## Task 1: Create branch

- [ ] **Step 1: Create branch from etapa2**

```bash
git checkout feat/argentina-etapa2-mercadopago
git checkout -b feat/argentina-etapa3-billing-multiregion
```

---

## Task 2: Write failing tests for `PaymentProviderRouter`

**Files:**
- Create: `src/__tests__/lib/payment-provider-router.unit.spec.ts`

- [ ] **Step 1: Create test file**

```typescript
// src/__tests__/lib/payment-provider-router.unit.spec.ts
import { getChargeClient } from "../../lib/payment-provider-router"

describe("getChargeClient", () => {
  const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }

  const mockContainer = {
    resolve: jest.fn().mockReturnValue(mockLogger),
  }

  afterEach(() => {
    jest.clearAllMocks()
    // Reset env vars
    delete process.env.OPENPAY_MERCHANT_ID
    delete process.env.OPENPAY_PRIVATE_KEY
    delete process.env.MP_ACCESS_TOKEN
  })

  it("returns an Openpay charge client for pp_openpay", () => {
    process.env.OPENPAY_MERCHANT_ID = "m123"
    process.env.OPENPAY_PRIVATE_KEY = "pk_test"
    const client = getChargeClient("pp_openpay", mockContainer as any)
    expect(client).toBeDefined()
    expect(typeof client.chargeSubscription).toBe("function")
  })

  it("returns a MercadoPago charge client for pp_mercadopago", () => {
    process.env.MP_ACCESS_TOKEN = "TEST-token"
    const client = getChargeClient("pp_mercadopago", mockContainer as any)
    expect(client).toBeDefined()
    expect(typeof client.chargeSubscription).toBe("function")
  })

  it("throws for unknown provider", () => {
    expect(() => getChargeClient("pp_stripe", mockContainer as any)).toThrow(
      "No charge client configured for provider: pp_stripe"
    )
  })
})
```

- [ ] **Step 2: Run — confirm fail**

```bash
npx jest src/__tests__/lib/payment-provider-router.unit.spec.ts --no-coverage
```

Expected: `Cannot find module '../../lib/payment-provider-router'`

---

## Task 3: Implement `PaymentProviderRouter`

**Files:**
- Create: `src/lib/payment-provider-router.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/payment-provider-router.ts
import { MedusaContainer } from "@medusajs/framework/types"
import { OpenpayClient } from "../modules/openpay-payment/openpay-client"
import { MercadoPagoClient } from "../modules/mercadopago-payment/mercadopago-client"

export type ChargeParams = {
  customerId: string       // vault customer ID (openpay_customer_id or mp_customer_id)
  cardId: string           // vault card ID (openpay card id or mp card id)
  amount: number           // major units
  currency: string         // "MXN" or "ARS"
  description: string
  externalReference?: string
}

export type ChargeResult = {
  chargeId: string
}

export type ChargeClient = {
  chargeSubscription(params: ChargeParams): Promise<ChargeResult>
  // For recurring: get a charge token from a saved card (MP needs this; Openpay uses card ID directly)
  getChargeToken?(customerId: string, cardId: string): Promise<string>
}

function makeOpenpayChargeClient(container: MedusaContainer): ChargeClient {
  const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
  const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
  const sandbox = process.env.OPENPAY_SANDBOX !== "false"

  if (!merchantId || !privateKey) {
    throw new Error("Openpay credentials not configured (OPENPAY_MERCHANT_ID, OPENPAY_PRIVATE_KEY)")
  }

  const client = new OpenpayClient({ merchantId, privateKey, sandbox })

  return {
    async chargeSubscription({ customerId, cardId, amount, currency, description, externalReference }) {
      const charge = await client.chargeCustomerCard(customerId, {
        source_id: cardId,
        amount,
        currency,
        description,
        order_id: externalReference,
      })
      return { chargeId: charge.id }
    },
  }
}

function makeMercadoPagoChargeClient(container: MedusaContainer): ChargeClient {
  const accessToken = process.env.MP_ACCESS_TOKEN ?? ""
  const sandbox = process.env.NODE_ENV !== "production"

  if (!accessToken) {
    throw new Error("MercadoPago credentials not configured (MP_ACCESS_TOKEN)")
  }

  const client = new MercadoPagoClient({ accessToken, sandbox })

  return {
    async chargeSubscription({ customerId, cardId, amount, currency, description, externalReference }) {
      // For recurring billing, we get a new charge token from the saved card (no CVV required)
      const chargeToken = await client.getCardToken(customerId, cardId)

      const payment = await client.charge({
        token: chargeToken,
        amount,
        currencyCode: currency,
        description,
        mpCustomerId: customerId,
        externalReference,
      })
      return { chargeId: String(payment.id) }
    },
    async getChargeToken(customerId: string, cardId: string): Promise<string> {
      return client.getCardToken(customerId, cardId)
    },
  }
}

export function getChargeClient(providerId: string, container: MedusaContainer): ChargeClient {
  switch (providerId) {
    case "pp_openpay":
      return makeOpenpayChargeClient(container)
    case "pp_mercadopago":
      return makeMercadoPagoChargeClient(container)
    default:
      throw new Error(`No charge client configured for provider: ${providerId}`)
  }
}
```

- [ ] **Step 2: Run tests — confirm pass**

```bash
npx jest src/__tests__/lib/payment-provider-router.unit.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/payment-provider-router.ts \
        src/__tests__/lib/payment-provider-router.unit.spec.ts
git commit -m "feat(argentina): add PaymentProviderRouter — routes billing charges to correct gateway"
```

---

## Task 4: Write failing test for `resolve-payment-provider` step

**Files:**
- Create: `src/__tests__/workflows/resolve-payment-provider.unit.spec.ts`

- [ ] **Step 1: Create test file**

```typescript
// src/__tests__/workflows/resolve-payment-provider.unit.spec.ts
import { resolvePaymentProviderStep } from "../../workflows/process-billing-cycle/steps/resolve-payment-provider"

// createStep wraps the handler — extract the raw handler for unit testing
function extractHandler(step: any): Function {
  return step.__handler ?? step
}

describe("resolvePaymentProviderStep handler", () => {
  function makeContainer(orderData: any) {
    return {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === "logger") return { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
        if (key === "order") {
          return {
            retrieveOrder: jest.fn().mockResolvedValue(orderData),
          }
        }
        throw new Error(`Unknown module: ${key}`)
      }),
    }
  }

  it("returns provider_id from the first payment session", async () => {
    const order = {
      id: "order_1",
      payment_collections: [{
        payment_sessions: [{ provider_id: "pp_openpay" }]
      }],
    }
    const container = makeContainer(order)

    // We test the step logic directly using the Medusa step runner pattern
    // by importing and calling the step directly
    const { resolvePaymentProviderStepFn } = await import(
      "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
    )
    const result = await resolvePaymentProviderStepFn(
      { original_order_id: "order_1" },
      { container }
    )
    expect(result.provider_id).toBe("pp_openpay")
  })

  it("returns pp_openpay as fallback when no payment collection", async () => {
    const order = { id: "order_1", payment_collections: [] }
    const container = makeContainer(order)

    const { resolvePaymentProviderStepFn } = await import(
      "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
    )
    const result = await resolvePaymentProviderStepFn(
      { original_order_id: "order_1" },
      { container }
    )
    expect(result.provider_id).toBe("pp_openpay")
  })
})
```

- [ ] **Step 2: Run — confirm fail**

```bash
npx jest src/__tests__/workflows/resolve-payment-provider.unit.spec.ts --no-coverage
```

Expected: `Cannot find module '../../workflows/process-billing-cycle/steps/resolve-payment-provider'`

---

## Task 5: Implement `resolve-payment-provider` step

**Files:**
- Create: `src/workflows/process-billing-cycle/steps/resolve-payment-provider.ts`

- [ ] **Step 1: Create the step**

```typescript
// src/workflows/process-billing-cycle/steps/resolve-payment-provider.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

type Input = {
  original_order_id: string
}

type Output = {
  provider_id: string
}

// Exported for direct unit testing (the createStep wrapper makes it hard to call in tests)
export async function resolvePaymentProviderStepFn(
  input: Input,
  { container }: { container: any }
): Promise<Output> {
  const logger = container.resolve("logger")
  const orderService = container.resolve(Modules.ORDER)

  try {
    const order = await orderService.retrieveOrder(input.original_order_id, {
      relations: ["payment_collections.payment_sessions"],
    })

    const providerId = order?.payment_collections?.[0]?.payment_sessions?.[0]?.provider_id

    if (!providerId) {
      logger.warn(
        `[resolve-payment-provider] No payment session found on order ${input.original_order_id} — defaulting to pp_openpay`
      )
      return { provider_id: "pp_openpay" }
    }

    logger.info(`[resolve-payment-provider] Order ${input.original_order_id} → provider: ${providerId}`)
    return { provider_id: providerId }
  } catch (err) {
    logger.error(
      `[resolve-payment-provider] Failed to retrieve order ${input.original_order_id}: ${
        err instanceof Error ? err.message : String(err)
      } — defaulting to pp_openpay`
    )
    return { provider_id: "pp_openpay" }
  }
}

export const resolvePaymentProviderStep = createStep(
  "resolve-payment-provider-step",
  async (input: Input, { container }): Promise<StepResponse<Output, null>> => {
    const result = await resolvePaymentProviderStepFn(input, { container })
    return new StepResponse(result, null)
  }
)
```

- [ ] **Step 2: Run tests — confirm pass**

```bash
npx jest src/__tests__/workflows/resolve-payment-provider.unit.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/workflows/process-billing-cycle/steps/resolve-payment-provider.ts \
        src/__tests__/workflows/resolve-payment-provider.unit.spec.ts
git commit -m "feat(argentina): add resolve-payment-provider step"
```

---

## Task 6: Update `process-billing.ts` to use `PaymentProviderRouter`

**Files:**
- Modify: `src/workflows/process-billing-cycle/steps/process-billing.ts`

The current step hardcodes Openpay. We need to:
1. Accept `provider_id` as a new input field
2. Replace the Openpay-specific charge logic with `getChargeClient(provider_id, container).chargeSubscription(...)`
3. Replace the hardcoded `openpay_customer_id` lookup with a provider-aware customer vault ID lookup

- [ ] **Step 1: Update `ProcessBillingInput` and charge logic**

Find and replace the type definition at the top of the file:

```typescript
// OLD:
type ProcessBillingInput = {
  subscription_id: string
}

// NEW:
type ProcessBillingInput = {
  subscription_id: string
  provider_id?: string   // defaults to "pp_openpay" if not provided
}
```

- [ ] **Step 2: Add import for PaymentProviderRouter**

Add at the top of the file, after existing imports. **Keep** the existing `OpenpayClient` import — it is still used for the card listing fallback:

```typescript
import { getChargeClient } from "../../../lib/payment-provider-router"
```

- [ ] **Step 3: Replace the vault ID lookup (step 3 in the current file — "Get customer")**

Find the block starting with `const openpayCustomerId = customer.metadata?.openpay_customer_id as string | undefined` and replace through the `past_due` emit block:

```typescript
// OLD (lines that check openpayCustomerId):
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

// NEW:
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
  return new StepResponse({ failed: true, reason: `no_${vaultCustomerIdKey}` }, null)
}
```

- [ ] **Step 4: Replace steps 5-7 (Openpay credentials + card resolution + charge)**

Find the block labeled `// 5. Resolve Openpay credentials` through the charge block and replace with:

```typescript
// 5. Resolve charge client and card
let chargeClient: Awaited<ReturnType<typeof getChargeClient>>
try {
  chargeClient = getChargeClient(resolvedProvider, container)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  logger.error(`${LOG} Payment provider not configured: ${message}`)
  return new StepResponse({ skipped: true, reason: "provider_not_configured" }, null)
}

// 6. Get card to charge
const defaultCardIdKey = resolvedProvider === "pp_mercadopago" ? "mp_default_card_id" : "openpay_default_card_id"
let cardId = customer.metadata?.[defaultCardIdKey] as string | undefined

if (!cardId) {
  // Fallback: use Openpay or MP client directly to list cards
  if (resolvedProvider === "pp_mercadopago") {
    const accessToken = process.env.MP_ACCESS_TOKEN ?? ""
    if (accessToken) {
      const { MercadoPagoClient } = await import("../../../modules/mercadopago-payment/mercadopago-client")
      const mpClient = new MercadoPagoClient({ accessToken, sandbox: process.env.NODE_ENV !== "production" })
      const cards = await mpClient.listCards(vaultCustomerId)
      cardId = cards[0]?.id
    }
  } else {
    const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
    const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
    const sandbox = process.env.OPENPAY_SANDBOX !== "false"
    if (merchantId && privateKey) {
      const openpayClient = new OpenpayClient({ merchantId, privateKey, sandbox })
      const cards = await openpayClient.listCards(vaultCustomerId)
      cardId = cards[0]?.id
    }
  }
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

// 7. Charge via provider router
let chargeResult: { chargeId: string }
try {
  chargeResult = await chargeClient.chargeSubscription({
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
  return new StepResponse({ failed: true, reason: "charge_failed" }, null)
}
```

- [ ] **Step 5: Update the renewal order creation — replace `openpay_charge_id` references**

In step 8 (Create renewal order), replace `openpay_charge_id: charge.id` with `charge_id: chargeResult.chargeId` in both the line item metadata and the order metadata:

```typescript
// In items[0].metadata:
charge_id: chargeResult.chargeId,
payment_provider: resolvedProvider,

// In order metadata:
charge_id: chargeResult.chargeId,
payment_provider: resolvedProvider,
```

- [ ] **Step 6: Update the `subscription.renewed` event**

Replace `openpay_charge_id: charge.id` with `charge_id: chargeResult.chargeId`:

```typescript
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
```

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run existing billing tests**

```bash
npx jest src/__tests__/workflows/process-billing.unit.spec.ts --no-coverage
```

Expected: all tests pass. If any test fails because it references `openpay_charge_id`, update the assertion to `charge_id`.

- [ ] **Step 10: Commit**

```bash
git add src/workflows/process-billing-cycle/steps/process-billing.ts
git commit -m "feat(argentina): make process-billing provider-agnostic via PaymentProviderRouter"
```

---

## Task 7: Wire `resolve-payment-provider` step into the workflow

**Files:**
- Modify: `src/workflows/process-billing-cycle/index.ts`

- [ ] **Step 1: Update the workflow**

Replace the entire file:

```typescript
// src/workflows/process-billing-cycle/index.ts
import { createWorkflow, WorkflowResponse, transform } from "@medusajs/framework/workflows-sdk"
import { resolvePaymentProviderStep } from "./steps/resolve-payment-provider"
import { processBillingStep } from "./steps/process-billing"
import { SUBSCRIPTION_MODULE } from "../../modules/subscription"

type ProcessBillingCycleInput = {
  subscription_id: string
}

const processBillingCycleWorkflow = createWorkflow(
  "process-billing-cycle",
  function (input: ProcessBillingCycleInput) {
    // Step 1: resolve which payment provider this subscription uses
    // (reads original order's payment_collections)
    const { provider_id } = resolvePaymentProviderStep({
      original_order_id: transform(input, (i) => i.subscription_id), // placeholder — billing step reads it internally
    })

    // Step 2: charge the subscription via the correct provider
    const result = processBillingStep({
      subscription_id: input.subscription_id,
      provider_id,
    })

    return new WorkflowResponse(result)
  }
)

export default processBillingCycleWorkflow
```

> **Note on the original_order_id:** The `resolvePaymentProviderStep` needs the `original_order_id` of the subscription, but `processBillingCycleWorkflow` only receives `subscription_id`. The step internally loads the subscription to get `original_order_id`. Update the step input type to accept `subscription_id` directly.

- [ ] **Step 2: Update `resolve-payment-provider.ts` to accept `subscription_id`**

Update the step to load the subscription itself:

```typescript
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
      logger.warn(`[resolve-payment-provider] No original_order_id on subscription ${input.subscription_id} — defaulting to pp_openpay`)
      return { provider_id: "pp_openpay" }
    }

    const order = await orderService.retrieveOrder(subscription.original_order_id, {
      relations: ["payment_collections.payment_sessions"],
    })

    const providerId = order?.payment_collections?.[0]?.payment_sessions?.[0]?.provider_id

    if (!providerId) {
      logger.warn(`[resolve-payment-provider] No payment session on order ${subscription.original_order_id} — defaulting to pp_openpay`)
      return { provider_id: "pp_openpay" }
    }

    logger.info(`[resolve-payment-provider] Subscription ${input.subscription_id} → provider: ${providerId}`)
    return { provider_id: providerId }
  } catch (err) {
    logger.error(
      `[resolve-payment-provider] Error: ${err instanceof Error ? err.message : String(err)} — defaulting to pp_openpay`
    )
    return { provider_id: "pp_openpay" }
  }
}

export const resolvePaymentProviderStep = createStep(
  "resolve-payment-provider-step",
  async (input: Input, { container }): Promise<StepResponse<Output, null>> => {
    const result = await resolvePaymentProviderStepFn(input, { container })
    return new StepResponse(result, null)
  }
)
```

- [ ] **Step 3: Update the workflow to use `subscription_id` directly**

```typescript
// src/workflows/process-billing-cycle/index.ts
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { resolvePaymentProviderStep } from "./steps/resolve-payment-provider"
import { processBillingStep } from "./steps/process-billing"

type ProcessBillingCycleInput = {
  subscription_id: string
}

const processBillingCycleWorkflow = createWorkflow(
  "process-billing-cycle",
  function (input: ProcessBillingCycleInput) {
    const { provider_id } = resolvePaymentProviderStep({ subscription_id: input.subscription_id })
    const result = processBillingStep({ subscription_id: input.subscription_id, provider_id })
    return new WorkflowResponse(result)
  }
)

export default processBillingCycleWorkflow
```

- [ ] **Step 4: Update the resolve-payment-provider test** to pass `subscription_id` instead of `original_order_id`

In `src/__tests__/workflows/resolve-payment-provider.unit.spec.ts`, update the mock container to also resolve `SUBSCRIPTION_MODULE`:

```typescript
// Updated makeContainer helper in the test:
function makeContainer(subscriptionData: any, orderData: any) {
  return {
    resolve: jest.fn().mockImplementation((key: string) => {
      if (key === "logger") return { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
      if (key === "subscriptionModuleService") {
        return { retrieveSubscription: jest.fn().mockResolvedValue(subscriptionData) }
      }
      if (key === "order") {
        return { retrieveOrder: jest.fn().mockResolvedValue(orderData) }
      }
      throw new Error(`Unknown module: ${key}`)
    }),
  }
}

// Updated test calls:
it("returns provider_id from the first payment session", async () => {
  const subscription = { id: "sub_1", original_order_id: "order_1" }
  const order = {
    id: "order_1",
    payment_collections: [{ payment_sessions: [{ provider_id: "pp_openpay" }] }],
  }
  const container = makeContainer(subscription, order)
  const { resolvePaymentProviderStepFn } = await import(
    "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
  )
  const result = await resolvePaymentProviderStepFn({ subscription_id: "sub_1" }, { container })
  expect(result.provider_id).toBe("pp_openpay")
})

it("returns pp_openpay as fallback when no payment collection", async () => {
  const subscription = { id: "sub_1", original_order_id: "order_1" }
  const order = { id: "order_1", payment_collections: [] }
  const container = makeContainer(subscription, order)
  const { resolvePaymentProviderStepFn } = await import(
    "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
  )
  const result = await resolvePaymentProviderStepFn({ subscription_id: "sub_1" }, { container })
  expect(result.provider_id).toBe("pp_openpay")
})
```

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/workflows/process-billing-cycle/index.ts \
        src/workflows/process-billing-cycle/steps/resolve-payment-provider.ts \
        src/__tests__/workflows/resolve-payment-provider.unit.spec.ts
git commit -m "feat(argentina): wire resolve-payment-provider into process-billing-cycle workflow"
```

---

## Task 8: Update cron schedule

**Files:**
- Modify: `src/jobs/process-daily-subscriptions.ts`

- [ ] **Step 1: Change cron schedule**

Find the export at the bottom of the file:

```typescript
// OLD:
export const config = {
  name: "process-daily-subscriptions",
  // 06:00 UTC = midnight CST (Mexico City, UTC-6)
  schedule: "0 6 * * *",
}

// NEW:
export const config = {
  name: "process-daily-subscriptions",
  // 03:00 UTC = midnight ART (Argentina, UTC-3)
  // Mexico City (UTC-6) runs at 21:00 CST — acceptable for subscription billing
  schedule: "0 3 * * *",
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/jobs/process-daily-subscriptions.ts
git commit -m "feat(argentina): shift billing cron to 03:00 UTC to cover midnight ART"
```

---

## Task 9: Final test run and push

- [ ] **Step 1: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass. Zero failures.

- [ ] **Step 2: Run TypeScript check one final time**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/argentina-etapa3-billing-multiregion
```
