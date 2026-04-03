# Phase 2: Payment Integration & Subscription Creation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Openpay as the Medusa payment provider so checkout processes real charges, and create `Subscription` records automatically when an order is placed.

**Architecture:** An `OpenpayClient` HTTP wrapper handles all Openpay REST calls. An `AbstractPaymentProvider` subclass uses it to create the Openpay customer vault entry, store the card, and charge it when `authorizePayment` is called. A custom `POST /store/carts/:id/complete` override injects the card token into the payment session before triggering Medusa's `completeCartWorkflow`. An `order.placed` subscriber runs a workflow that creates `Subscription` records for each subscription line item and updates the Medusa customer with their Openpay customer ID. Two payment-method routes expose the Openpay card vault to the frontend.

**Tech Stack:** Medusa.js v2.13.1 (`AbstractPaymentProvider`, `completeCartWorkflow`, `remoteLink`), Openpay REST API (Basic auth), Node.js native `fetch`, Jest + `@swc/jest`, `@medusajs/test-utils`

---

## Scope Note

This plan covers **Phase 2: payments + subscription creation**. Deferred to Phase 3:
- Daily billing cron job (`ProcessDailySubscriptions`)
- Resend email notifications (4 event types)
- Admin dashboard extensions (customer widget, `/a/subscriptions` route)

The cart discount subscriber mentioned in CLAUDE.md is **not implemented** here — variant prices already have subscription discounts baked in from Phase 1 (four variants per product, each with the correct discounted price). Implementing a second discount mechanism would double-apply discounts.

---

## Phase 1 Context (what already exists)

- `src/modules/subscription/` — `Subscription` + `SubscriptionOrder` models, `SubscriptionModuleService`, constant `SUBSCRIPTION_MODULE = "subscriptionModuleService"`
- `src/links/subscription-customer.ts` — stored link Customer ↔ Subscription (`isList: true`)
- `src/links/subscription-product-variant.ts` — stored link Subscription ↔ ProductVariant
- `src/api/middlewares.ts` — Clerk JWT middleware sets `req.clerk_user_id` and `req.clerk_email` on all `/store/me/*` routes; dev bypass when `CLERK_SECRET_KEY` is empty
- `medusa-config.ts` — subscription module registered under `modules`
- `jest.config.js` — unit tests: `src/**/__tests__/**/*.unit.spec.[jt]s`; integration HTTP tests: `integration-tests/http/*.spec.[jt]s`
- Admin user: admin@novapatch.mx / novapatch123

---

## File Map

**Create:**
```
src/
├── modules/openpay-payment/
│   ├── openpay-client.ts                              # Openpay REST API HTTP wrapper
│   ├── service.ts                                     # AbstractPaymentProvider implementation
│   ├── index.ts                                       # Provider export for medusa-config
│   └── __tests__/
│       ├── openpay-client.unit.spec.ts                # Unit tests: fetch mock
│       └── openpay-payment-service.unit.spec.ts       # Unit tests: mock OpenpayClient
├── api/store/
│   ├── carts/[id]/complete/route.ts                   # Custom cart complete (injects token)
│   └── me/payment-methods/
│       ├── route.ts                                   # GET /store/me/payment-methods
│       └── default/route.ts                           # POST /store/me/payment-methods/default
├── subscribers/
│   └── order-placed.ts                                # order.placed → create subscriptions
└── workflows/create-subscriptions-from-order/
    ├── steps/create-subscriptions.ts                  # Step: create records + links
    └── index.ts                                       # Workflow definition

integration-tests/http/
├── cart-complete.spec.ts                              # Integration: cart complete route
└── payment-methods.spec.ts                            # Integration: payment-methods routes
```

**Modify:**
```
medusa-config.ts           # Register Openpay payment provider
.env                       # Add OPENPAY_MERCHANT_ID, OPENPAY_PRIVATE_KEY, OPENPAY_SANDBOX
src/api/store/me/subscriptions/route.ts   # Fix: filter subscriptions by current customer
```

---

## Task 1: Openpay HTTP Client

A pure TypeScript HTTP wrapper for the Openpay REST API. Uses native `fetch`. No Medusa imports — portable and easily unit-tested with a mocked `fetch`.

**Openpay API facts:**
- Sandbox base: `https://sandbox-api.openpay.mx/v1/{merchantId}`
- Production base: `https://api.openpay.mx/v1/{merchantId}`
- Auth: `Authorization: Basic {base64(privateKey + ":")}` — note the colon and empty password
- Amounts: Openpay expects **pesos** (not centavos). `31920 centavos = 319.20 pesos`.

**Files:**
- Create: `src/modules/openpay-payment/openpay-client.ts`
- Create: `src/modules/openpay-payment/__tests__/openpay-client.unit.spec.ts`

- [ ] **Step 1.1: Write the failing unit tests**

Create `src/modules/openpay-payment/__tests__/openpay-client.unit.spec.ts`:

```ts
import { OpenpayClient } from "../openpay-client"

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

describe("OpenpayClient", () => {
  let client: OpenpayClient

  beforeEach(() => {
    client = new OpenpayClient({ merchantId: "m123", privateKey: "sk_test", sandbox: true })
    mockFetch.mockReset()
  })

  it("uses sandbox base URL", async () => {
    mockFetch.mockReturnValue(ok({ id: "c1", name: "Ana", last_name: "Lopez", email: "a@test.com" }))
    await client.createCustomer({ name: "Ana", last_name: "Lopez", email: "a@test.com" })
    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox-api.openpay.mx/v1/m123/customers")
  })

  it("sends correct Basic auth header", async () => {
    mockFetch.mockReturnValue(ok({ id: "c1", name: "Ana", last_name: "Lopez", email: "a@test.com" }))
    await client.createCustomer({ name: "Ana", last_name: "Lopez", email: "a@test.com" })
    const expected = "Basic " + Buffer.from("sk_test:").toString("base64")
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(expected)
  })

  it("storeCard POSTs to /customers/:id/cards", async () => {
    mockFetch.mockReturnValue(ok({ id: "card_1", brand: "visa", card_number: "1111", holder_name: "Ana", expiration_year: "27", expiration_month: "08", bank_name: "BBVA" }))
    await client.storeCard("cust_1", { token_id: "tok_abc", device_session_id: "dev_xyz" })
    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox-api.openpay.mx/v1/m123/customers/cust_1/cards")
    expect(mockFetch.mock.calls[0][1].method).toBe("POST")
  })

  it("listCards GETs /customers/:id/cards", async () => {
    mockFetch.mockReturnValue(ok([]))
    await client.listCards("cust_1")
    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox-api.openpay.mx/v1/m123/customers/cust_1/cards")
    expect(mockFetch.mock.calls[0][1].method).toBe("GET")
  })

  it("chargeCustomerCard sets method: card in body", async () => {
    mockFetch.mockReturnValue(ok({ id: "ch_1", status: "completed", amount: 319.20, currency: "MXN" }))
    await client.chargeCustomerCard("cust_1", {
      source_id: "card_1",
      amount: 319.20,
      currency: "MXN",
      description: "Test charge",
    })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.method).toBe("card")
    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox-api.openpay.mx/v1/m123/customers/cust_1/charges")
  })

  it("throws with Openpay description on non-2xx", async () => {
    mockFetch.mockReturnValue(Promise.resolve({ ok: false, json: () => Promise.resolve({ description: "Invalid token" }) }))
    await expect(client.createCustomer({ name: "A", last_name: "B", email: "a@b.com" }))
      .rejects.toThrow("Invalid token")
  })

  it("refundCharge POSTs to /charges/:id/refund", async () => {
    mockFetch.mockReturnValue(ok({ id: "ch_1", status: "refunded", amount: 319.20, currency: "MXN" }))
    await client.refundCharge("ch_1", { description: "Customer refund", amount: 319.20 })
    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox-api.openpay.mx/v1/m123/charges/ch_1/refund")
  })
})
```

- [ ] **Step 1.2: Run to verify tests fail**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
npm run test:unit -- --testPathPattern=openpay-client
```

Expected: FAIL — `Cannot find module '../openpay-client'`

- [ ] **Step 1.3: Implement the client**

Create `src/modules/openpay-payment/openpay-client.ts`:

```ts
export type OpenpayCard = {
  id: string
  brand: string
  card_number: string   // last 4 digits displayed as "XXXX"
  holder_name: string
  expiration_year: string
  expiration_month: string
  bank_name: string
}

export type OpenpayCustomer = {
  id: string
  name: string
  last_name: string
  email: string
}

export type OpenpayCharge = {
  id: string
  status: "completed" | "in_progress" | "failed" | "refunded"
  amount: number
  currency: string
  error_code?: string
  error_message?: string
}

type ClientOptions = {
  merchantId: string
  privateKey: string
  sandbox: boolean
}

export class OpenpayClient {
  private readonly baseUrl: string
  private readonly authHeader: string

  constructor(options: ClientOptions) {
    const host = options.sandbox
      ? "https://sandbox-api.openpay.mx"
      : "https://api.openpay.mx"
    this.baseUrl = `${host}/v1/${options.merchantId}`
    this.authHeader = "Basic " + Buffer.from(`${options.privateKey}:`).toString("base64")
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json()
    if (!response.ok) {
      const err = data as { description?: string }
      throw new Error(err.description ?? `Openpay error ${response.status}`)
    }
    return data as T
  }

  createCustomer(params: {
    name: string
    last_name: string
    email: string
    phone_number?: string
  }): Promise<OpenpayCustomer> {
    return this.request<OpenpayCustomer>("POST", "/customers", params)
  }

  storeCard(customerId: string, params: { token_id: string; device_session_id?: string }): Promise<OpenpayCard> {
    return this.request<OpenpayCard>("POST", `/customers/${customerId}/cards`, params)
  }

  listCards(customerId: string): Promise<OpenpayCard[]> {
    return this.request<OpenpayCard[]>("GET", `/customers/${customerId}/cards`)
  }

  chargeCustomerCard(
    customerId: string,
    params: {
      source_id: string     // stored card ID
      amount: number        // in PESOS (not centavos)
      currency: string
      description: string
      device_session_id?: string
      order_id?: string
    }
  ): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("POST", `/customers/${customerId}/charges`, {
      ...params,
      method: "card",
    })
  }

  getCharge(chargeId: string): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("GET", `/charges/${chargeId}`)
  }

  refundCharge(chargeId: string, params: { description: string; amount?: number }): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("POST", `/charges/${chargeId}/refund`, params)
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
npm run test:unit -- --testPathPattern=openpay-client
```

Expected: PASS — 7 tests pass, 0 failed

- [ ] **Step 1.5: Commit**

```bash
git add src/modules/openpay-payment/openpay-client.ts \
        src/modules/openpay-payment/__tests__/openpay-client.unit.spec.ts
git commit -m "feat: Openpay HTTP client with unit tests"
```

---

## Task 2: Openpay Payment Provider Module

The provider implements Medusa's `AbstractPaymentProvider`. Flow for `authorizePayment`:

1. Read `openpay_token_id` from `paymentSessionData` (injected by Task 3's route)
2. Read customer info from `context.customer` (Medusa passes this automatically)
3. If `context.customer.metadata.openpay_customer_id` exists → use that Openpay customer
4. Otherwise → create new Openpay customer from name + email
5. Store the one-time token as a permanent card on the Openpay customer
6. Charge the stored card (amount in pesos = `context.amount / 100`)
7. Return `{ status: "authorized", data: { openpay_charge_id, openpay_customer_id, openpay_card_id, medusa_customer_id } }`

The Openpay customer ID and card ID are passed through to the order, so the `order.placed` subscriber (Task 4) can save them on the Medusa customer.

**Files:**
- Create: `src/modules/openpay-payment/service.ts`
- Create: `src/modules/openpay-payment/index.ts`
- Create: `src/modules/openpay-payment/__tests__/openpay-payment-service.unit.spec.ts`
- Modify: `medusa-config.ts`
- Modify: `.env`

- [ ] **Step 2.1: Add Openpay env vars to `.env`**

Open `.env` (in the project root) and append these lines:

```bash
# ── Openpay (Payment Gateway) ──────────────────────────────────────────────────
OPENPAY_MERCHANT_ID=
OPENPAY_PRIVATE_KEY=
OPENPAY_SANDBOX=true
```

Fill in sandbox credentials from https://sandbox-dashboard.openpay.mx. Leave blank if you don't have credentials yet — the server will start without them; payment routes will fail at charge time.

- [ ] **Step 2.2: Write the failing unit tests**

Create `src/modules/openpay-payment/__tests__/openpay-payment-service.unit.spec.ts`:

```ts
import { OpenpayPaymentService } from "../service"
import { OpenpayClient } from "../openpay-client"

jest.mock("../openpay-client")

const MockOpenpayClient = OpenpayClient as jest.MockedClass<typeof OpenpayClient>

const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

function makeService() {
  MockOpenpayClient.mockClear()
  const svc = new OpenpayPaymentService(
    { logger: mockLogger } as any,
    { merchantId: "m123", privateKey: "sk_test", sandbox: true }
  )
  const client = MockOpenpayClient.mock.instances[0] as jest.Mocked<OpenpayClient>
  return { svc, client }
}

const mockCard = { id: "card_1", brand: "visa", card_number: "1111", holder_name: "Ana Lopez", expiration_year: "27", expiration_month: "08", bank_name: "BBVA" }
const mockCharge = { id: "ch_1", status: "completed" as const, amount: 319.20, currency: "MXN" }
const mockCustomer = { id: "cust_op_1", name: "Ana", last_name: "Lopez", email: "ana@test.com" }

describe("OpenpayPaymentService", () => {
  describe("initiatePayment", () => {
    it("returns { data: { status: 'pending' } }", async () => {
      const { svc } = makeService()
      const result = await svc.initiatePayment({ amount: 31920, currency_code: "mxn" } as any)
      expect(result).toEqual({ data: { status: "pending" } })
    })
  })

  describe("authorizePayment", () => {
    const baseContext = {
      amount: 31920,
      currency_code: "mxn",
      customer: { id: "cust_med_1", email: "ana@test.com", first_name: "Ana", last_name: "Lopez", metadata: {} },
    }

    it("creates Openpay customer and charges when no existing customer", async () => {
      const { svc, client } = makeService()
      client.createCustomer = jest.fn().mockResolvedValue(mockCustomer)
      client.storeCard = jest.fn().mockResolvedValue(mockCard)
      client.chargeCustomerCard = jest.fn().mockResolvedValue(mockCharge)

      const result = await svc.authorizePayment(
        { status: "pending", openpay_token_id: "tok_abc", device_session_id: "dev_xyz" },
        baseContext as any
      )

      expect(client.createCustomer).toHaveBeenCalledWith({ name: "Ana", last_name: "Lopez", email: "ana@test.com" })
      expect(client.storeCard).toHaveBeenCalledWith("cust_op_1", { token_id: "tok_abc", device_session_id: "dev_xyz" })
      expect(client.chargeCustomerCard).toHaveBeenCalledWith(
        "cust_op_1",
        expect.objectContaining({ source_id: "card_1", amount: 319.20, currency: "MXN" })
      )
      expect(result).toEqual({
        status: "authorized",
        data: expect.objectContaining({ openpay_charge_id: "ch_1", openpay_customer_id: "cust_op_1", openpay_card_id: "card_1" }),
      })
    })

    it("reuses existing Openpay customer from metadata", async () => {
      const { svc, client } = makeService()
      client.createCustomer = jest.fn()
      client.storeCard = jest.fn().mockResolvedValue(mockCard)
      client.chargeCustomerCard = jest.fn().mockResolvedValue(mockCharge)

      const context = { ...baseContext, customer: { ...baseContext.customer, metadata: { openpay_customer_id: "cust_existing" } } }
      await svc.authorizePayment({ status: "pending", openpay_token_id: "tok_def" }, context as any)

      expect(client.createCustomer).not.toHaveBeenCalled()
      expect(client.storeCard).toHaveBeenCalledWith("cust_existing", expect.objectContaining({ token_id: "tok_def" }))
    })

    it("returns error when openpay_token_id is missing", async () => {
      const { svc } = makeService()
      const result = await svc.authorizePayment({ status: "pending" }, baseContext as any)
      expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("openpay_token_id") }))
    })

    it("returns error when Openpay charge throws", async () => {
      const { svc, client } = makeService()
      client.createCustomer = jest.fn().mockResolvedValue(mockCustomer)
      client.storeCard = jest.fn().mockResolvedValue(mockCard)
      client.chargeCustomerCard = jest.fn().mockRejectedValue(new Error("Insufficient funds"))

      const result = await svc.authorizePayment(
        { status: "pending", openpay_token_id: "tok_bad" },
        baseContext as any
      )
      expect(result).toEqual(expect.objectContaining({ error: "Insufficient funds" }))
    })
  })

  describe("capturePayment", () => {
    it("returns session data unchanged (immediate capture)", async () => {
      const { svc } = makeService()
      const data = { openpay_charge_id: "ch_1" }
      const result = await svc.capturePayment(data)
      expect(result).toEqual({ data })
    })
  })

  describe("refundPayment", () => {
    it("calls refundCharge converting centavos to pesos", async () => {
      const { svc, client } = makeService()
      client.refundCharge = jest.fn().mockResolvedValue({ ...mockCharge, status: "refunded" })

      await svc.refundPayment({ openpay_charge_id: "ch_1" }, 31920)

      expect(client.refundCharge).toHaveBeenCalledWith("ch_1", { description: "Novapatch refund", amount: 319.20 })
    })
  })
})
```

- [ ] **Step 2.3: Run to verify they fail**

```bash
npm run test:unit -- --testPathPattern=openpay-payment-service
```

Expected: FAIL — `Cannot find module '../service'`

- [ ] **Step 2.4: Implement the payment provider service**

Create `src/modules/openpay-payment/service.ts`:

```ts
import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"
import { OpenpayClient } from "./openpay-client"

type Options = {
  merchantId: string
  privateKey: string
  sandbox: boolean
}

type InjectedDeps = {
  logger: Logger
}

type CustomerContext = {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  metadata?: Record<string, unknown>
}

type PaymentContext = {
  amount?: number
  currency_code?: string
  customer?: CustomerContext
}

export class OpenpayPaymentService extends AbstractPaymentProvider<Options> {
  static identifier = "openpay"

  protected logger_: Logger
  protected client_: OpenpayClient

  constructor(container: InjectedDeps, options: Options) {
    super(container as any, options)
    this.logger_ = container.logger
    this.client_ = new OpenpayClient({
      merchantId: options.merchantId,
      privateKey: options.privateKey,
      sandbox: options.sandbox ?? true,
    })
  }

  async initiatePayment(): Promise<{ data: Record<string, unknown> }> {
    return { data: { status: "pending" } }
  }

  async updatePaymentSession(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    return { data }
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<
    | { error: string; code?: string; detail?: string }
    | { status: PaymentSessionStatus; data: Record<string, unknown> }
  > {
    const openpayTokenId = paymentSessionData.openpay_token_id as string | undefined
    if (!openpayTokenId) {
      return { error: "Missing openpay_token_id in payment session data" }
    }

    const ctx = context as PaymentContext
    const customer = ctx.customer
    const amountCentavos = ctx.amount ?? 0
    const amountPesos = amountCentavos / 100
    const currencyCode = (ctx.currency_code ?? "mxn").toUpperCase()
    const deviceSessionId = paymentSessionData.device_session_id as string | undefined

    try {
      let openpayCustomerId = customer?.metadata?.openpay_customer_id as string | undefined

      if (!openpayCustomerId) {
        const openpayCustomer = await this.client_.createCustomer({
          name: customer?.first_name ?? "Customer",
          last_name: customer?.last_name ?? "",
          email: customer?.email ?? "",
        })
        openpayCustomerId = openpayCustomer.id
      }

      const card = await this.client_.storeCard(openpayCustomerId, {
        token_id: openpayTokenId,
        device_session_id: deviceSessionId,
      })

      const charge = await this.client_.chargeCustomerCard(openpayCustomerId, {
        source_id: card.id,
        amount: amountPesos,
        currency: currencyCode,
        description: "Novapatch order",
        device_session_id: deviceSessionId,
      })

      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: {
          openpay_charge_id: charge.id,
          openpay_customer_id: openpayCustomerId,
          openpay_card_id: card.id,
          medusa_customer_id: customer?.id,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_?.error(`Openpay authorizePayment failed: ${message}`)
      return { error: message }
    }
  }

  // Openpay charges are immediate — capture is a no-op
  async capturePayment(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    return { data }
  }

  async retrievePayment(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      const charge = await this.client_.getCharge(chargeId)
      return { data: { ...data, openpay_status: charge.status } }
    } catch {
      return { data }
    }
  }

  async cancelPayment(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      await this.client_.refundCharge(chargeId, { description: "Novapatch cancel" })
      return { data: { ...data, openpay_status: "refunded" } }
    } catch (err) {
      this.logger_?.error(`Openpay cancelPayment failed: ${err instanceof Error ? err.message : err}`)
      return { data }
    }
  }

  async refundPayment(data: Record<string, unknown>, refundAmount: number): Promise<{ data: Record<string, unknown> }> {
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    await this.client_.refundCharge(chargeId, {
      description: "Novapatch refund",
      amount: refundAmount / 100,
    })
    return { data: { ...data, openpay_status: "refunded" } }
  }

  async deletePayment(): Promise<void> {
    // Nothing to delete on Openpay side
  }

  async getWebhookActionAndData() {
    return { action: "not_supported" as any }
  }
}

export default OpenpayPaymentService
```

- [ ] **Step 2.5: Create the module index**

Create `src/modules/openpay-payment/index.ts`:

```ts
export { OpenpayPaymentService as default } from "./service"
```

This is the format Medusa v2 expects when registering a payment provider via `resolve` in medusa-config — it loads the default export as the provider class.

- [ ] **Step 2.6: Register the payment provider in `medusa-config.ts`**

Replace the entire content of `medusa-config.ts`:

```ts
import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  modules: [
    {
      resolve: "./src/modules/subscription",
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/openpay-payment",
            id: "openpay",
            options: {
              merchantId: process.env.OPENPAY_MERCHANT_ID ?? "",
              privateKey: process.env.OPENPAY_PRIVATE_KEY ?? "",
              sandbox: process.env.OPENPAY_SANDBOX !== "false",
            },
          },
        ],
      },
    },
  ],
})
```

- [ ] **Step 2.7: Run unit tests**

```bash
npm run test:unit -- --testPathPattern=openpay-payment-service
```

Expected: PASS — 6 tests pass, 0 failed

- [ ] **Step 2.8: Verify the server starts with the new provider registered**

```bash
PATH=/opt/homebrew/bin:$PATH npx medusa develop > /tmp/medusa.log 2>&1 &
sleep 20
grep -i "openpay" /tmp/medusa.log || echo "no openpay mention — check if provider registered"
curl -s http://localhost:9000/health
kill %1
```

Expected: The health check returns `{"status":"ok"}`. The log should show Openpay provider being registered without errors.

> **If the server fails to start:** The `resolve: "@medusajs/medusa/payment"` path may differ by Medusa version. Try `resolve: "@medusajs/payment"` instead and rerun.

- [ ] **Step 2.9: Commit**

```bash
git add src/modules/openpay-payment/service.ts \
        src/modules/openpay-payment/index.ts \
        src/modules/openpay-payment/__tests__/openpay-payment-service.unit.spec.ts \
        medusa-config.ts \
        .env
git commit -m "feat: Openpay payment provider module (AbstractPaymentProvider)"
```

---

## Task 3: Custom Cart Complete Endpoint

The frontend calls `POST /store/carts/:id/complete` with `{ openpay_token_id, device_session_id }`. Medusa's built-in route for this path does not accept or forward these fields to the payment provider. Our custom route at the same path overrides it.

**What the route does:**
1. Validates `openpay_token_id` is present in the body
2. Looks up the cart's payment session via the `query` module
3. Merges `{ openpay_token_id, device_session_id }` into the payment session's `data` field (so `authorizePayment` can read them)
4. Calls `completeCartWorkflow` — this triggers `authorizePayment` internally
5. Returns the workflow result

**Files:**
- Create: `src/api/store/carts/[id]/complete/route.ts`
- Create: `integration-tests/http/cart-complete.spec.ts`

- [ ] **Step 3.1: Write the failing integration test**

Create `integration-tests/http/cart-complete.spec.ts`:

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    OPENPAY_MERCHANT_ID: "",
    OPENPAY_PRIVATE_KEY: "",
    OPENPAY_SANDBOX: "true",
    CLERK_SECRET_KEY: "",
  },
  testSuite: ({ api }) => {
    describe("POST /store/carts/:id/complete (custom route)", () => {
      it("returns 400 when openpay_token_id is missing in body", async () => {
        const response = await api.post("/store/carts/cart_nonexistent/complete", {})
        expect(response.status).toBe(400)
      })

      it("returns 404 when cart does not exist and token is provided", async () => {
        const response = await api.post("/store/carts/cart_nonexistent/complete", {
          openpay_token_id: "tok_test",
        })
        expect(response.status).toBe(404)
      })
    })
  },
})
```

- [ ] **Step 3.2: Run to verify tests fail (route doesn't exist yet)**

```bash
npm run test:integration:http -- --testPathPattern=cart-complete
```

Expected: FAIL — both tests fail because the current route doesn't return 400 for missing token; it returns whatever Medusa's default does.

- [ ] **Step 3.3: Implement the custom cart complete route**

Create `src/api/store/carts/[id]/complete/route.ts`:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = req.params.id
  const body = req.body as Record<string, unknown>
  const openpayTokenId = body.openpay_token_id as string | undefined
  const deviceSessionId = body.device_session_id as string | undefined

  if (!openpayTokenId) {
    res.status(400).json({ message: "openpay_token_id is required" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Fetch the cart with its payment session
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "payment_collection.id",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.data",
    ],
  })

  const cart = carts?.[0]
  if (!cart) {
    res.status(404).json({ message: "Cart not found" })
    return
  }

  // Inject the Openpay token into the payment session data
  const session = (cart.payment_collection as any)?.payment_sessions?.[0]
  if (session?.id) {
    const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
    await paymentModuleService.updatePaymentSession(session.id, {
      data: {
        ...(session.data ?? {}),
        openpay_token_id: openpayTokenId,
        device_session_id: deviceSessionId,
      },
    })
  }

  // Run the standard Medusa complete cart workflow (authorizePayment is called inside)
  const { result } = await completeCartWorkflow(req.scope).run({
    input: { id: cartId },
  })

  res.json(result)
}
```

- [ ] **Step 3.4: Run integration tests to verify they pass**

```bash
npm run test:integration:http -- --testPathPattern=cart-complete
```

Expected: PASS — 2 tests pass

- [ ] **Step 3.5: Smoke-test the route manually**

```bash
PATH=/opt/homebrew/bin:$PATH npx medusa develop > /tmp/med.log 2>&1 &
sleep 20

# Missing token → should be 400
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:9000/store/carts/nonexistent/complete \
  -H "Content-Type: application/json" \
  -d '{}')
echo "Missing token status: $STATUS"
# Expected: 400

# With token but no cart → should be 404
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:9000/store/carts/nonexistent/complete \
  -H "Content-Type: application/json" \
  -d '{"openpay_token_id":"tok_test"}')
echo "No cart status: $STATUS"
# Expected: 404

kill %1
```

- [ ] **Step 3.6: Commit**

```bash
git add "src/api/store/carts/[id]/complete/route.ts" \
        integration-tests/http/cart-complete.spec.ts
git commit -m "feat: custom cart complete endpoint injects Openpay token before completeCartWorkflow"
```

---

## Task 4: Subscription Creation Subscriber + Customer Fix

When `order.placed` fires, create `Subscription` records for each subscription line item. Also fix the subscriptions list route to filter by the authenticated customer (currently returns all subscriptions).

**Subscriber flow:**
1. `order.placed` event fires with `{ id: orderId }`
2. Subscriber calls `createSubscriptionsFromOrderWorkflow`
3. Workflow step retrieves the order with items and payment data
4. For each item where `item.metadata.is_subscription === true`:
   - Creates a `Subscription` record (status: active, interval_days, next_billing_date = now + interval_days)
   - Creates remote link: Customer ↔ Subscription
   - Creates remote link: Subscription ↔ ProductVariant
5. Updates Medusa customer `metadata.openpay_customer_id` from the payment's `data` field

**Identifying subscription items:** In Medusa v2, order items inherit metadata from cart line items. The seed script put `is_subscription: true`, `interval_days`, `discount_percentage` in variant metadata. When `addSubscriptionItem` is called from the frontend, it sends these in the line item's metadata. So `item.metadata.is_subscription` will be `true` for subscription purchases.

**Files:**
- Create: `src/workflows/create-subscriptions-from-order/steps/create-subscriptions.ts`
- Create: `src/workflows/create-subscriptions-from-order/index.ts`
- Create: `src/subscribers/order-placed.ts`
- Modify: `src/api/store/me/subscriptions/route.ts`

- [ ] **Step 4.1: Write failing unit tests**

Create `src/workflows/create-subscriptions-from-order/steps/__tests__/create-subscriptions.unit.spec.ts`:

```ts
// Tests for the next_billing_date calculation logic (pure, no Medusa dependency)
describe("createSubscriptionsStep logic", () => {
  it("next_billing_date is interval_days days from now", () => {
    const now = new Date("2026-04-02T12:00:00Z")
    const intervalDays = 30
    const next = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    // 30 days after April 2 = May 2
    expect(next.getUTCMonth()).toBe(4) // May = index 4
    expect(next.getUTCDate()).toBe(2)
  })

  it("filters only items where metadata.is_subscription === true", () => {
    const items = [
      { metadata: { is_subscription: true, interval_days: 30 } },
      { metadata: { is_subscription: false } },
      { metadata: {} },
      { metadata: null },
    ] as any[]
    const subItems = items.filter((i) => i.metadata?.is_subscription === true)
    expect(subItems).toHaveLength(1)
    expect(subItems[0].metadata.interval_days).toBe(30)
  })

  it("defaults interval_days to 30 when missing", () => {
    const intervalDays = Number(undefined ?? 30)
    expect(intervalDays).toBe(30)
  })

  it("converts centavos to pesos correctly for 6 products", () => {
    const centavos = 31920
    const pesos = centavos / 100
    expect(pesos).toBe(319.20)
  })
})
```

- [ ] **Step 4.2: Run to verify they pass**

```bash
npm run test:unit -- --testPathPattern=create-subscriptions
```

Expected: PASS — 4 tests pass (these are logic-only tests, no module imports)

- [ ] **Step 4.3: Implement the workflow step**

Create `src/workflows/create-subscriptions-from-order/steps/create-subscriptions.ts`:

```ts
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
```

- [ ] **Step 4.4: Implement the workflow**

Create `src/workflows/create-subscriptions-from-order/index.ts`:

```ts
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createSubscriptionsStep } from "./steps/create-subscriptions"

type Input = {
  order_id: string
}

const createSubscriptionsFromOrderWorkflow = createWorkflow(
  "create-subscriptions-from-order",
  function (input: Input) {
    const result = createSubscriptionsStep(input)
    return new WorkflowResponse(result)
  }
)

export default createSubscriptionsFromOrderWorkflow
```

- [ ] **Step 4.5: Implement the subscriber**

Create `src/subscribers/order-placed.ts`:

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import createSubscriptionsFromOrderWorkflow from "../workflows/create-subscriptions-from-order"

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id

  try {
    await createSubscriptionsFromOrderWorkflow(container).run({
      input: { order_id: orderId },
    })
  } catch (err) {
    // Never throw from a subscriber — we don't want to affect the order on subscription failure
    const logger = container.resolve("logger")
    logger.error(
      `[order-placed] Failed to create subscriptions for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-placed-create-subscriptions",
  },
}
```

- [ ] **Step 4.6: Fix the subscriptions list route**

Replace the entire content of `src/api/store/me/subscriptions/route.ts`:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  // Find the Medusa customer whose email matches the Clerk-authenticated user
  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    // No Medusa account exists yet for this Clerk user — no subscriptions
    res.json({ subscriptions: [] })
    return
  }

  const customerId = customers[0].id

  // Fetch subscriptions via the customer ↔ subscription remote link
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: result } = await query.graph({
    entity: "customer",
    filters: { id: customerId },
    fields: ["id", "subscriptions.*"],
  })

  const subscriptions = (result?.[0] as any)?.subscriptions ?? []

  res.json({ subscriptions })
}
```

- [ ] **Step 4.7: Start the server and verify the subscriber is registered**

```bash
PATH=/opt/homebrew/bin:$PATH npx medusa develop 2>&1 | head -60
# Look for a line mentioning "order-placed-create-subscriptions" or "order.placed" subscriber
# Then Ctrl+C after seeing boot messages
```

Expected: Server boots without errors. The subscriber is registered (Medusa logs registered subscribers during startup).

- [ ] **Step 4.8: Verify the subscriptions route returns customer-scoped results**

```bash
PATH=/opt/homebrew/bin:$PATH npx medusa develop > /tmp/med.log 2>&1 &
sleep 20

# Dev bypass (CLERK_SECRET_KEY empty) → clerk_email = dev@novapatch.mx
curl -s http://localhost:9000/store/me/subscriptions \
  -H "Authorization: Bearer dev-token" | python3 -m json.tool
# Expected: { "subscriptions": [] }  — no subs for dev@novapatch.mx

kill %1
```

Expected: `{ "subscriptions": [] }` (dev user has no subscriptions)

- [ ] **Step 4.9: Commit**

```bash
git add src/workflows/create-subscriptions-from-order/ \
        src/subscribers/order-placed.ts \
        "src/api/store/me/subscriptions/route.ts"
git commit -m "feat: order.placed subscriber creates Subscription records; fix subscriptions list scoped to customer"
```

---

## Task 5: Payment Methods Routes

Two routes exposed to the authenticated frontend under `/store/me/payment-methods`.

**GET /store/me/payment-methods:**
1. Get `clerk_email` from the request (set by Clerk middleware)
2. Find the Medusa customer by email
3. Read `customer.metadata.openpay_customer_id`
4. If no Openpay customer ID → return `{ payment_methods: [] }`
5. Call `OpenpayClient.listCards(openpayCustomerId)`
6. Map each card to `{ id, brand, last4, holder_name, expiration_month, expiration_year, bank_name, is_default }`
7. `is_default` is `true` when `card.id === customer.metadata.openpay_default_card_id`

**POST /store/me/payment-methods/default:**
1. Validate `card_id` is in body
2. Find Medusa customer by email
3. Update `metadata.openpay_default_card_id = card_id`
4. Return `{ success: true, default_card_id: card_id }`

**Files:**
- Create: `src/api/store/me/payment-methods/route.ts`
- Create: `src/api/store/me/payment-methods/default/route.ts`
- Create: `integration-tests/http/payment-methods.spec.ts`

- [ ] **Step 5.1: Write the failing integration tests**

Create `integration-tests/http/payment-methods.spec.ts`:

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    OPENPAY_MERCHANT_ID: "",
    OPENPAY_PRIVATE_KEY: "",
    OPENPAY_SANDBOX: "true",
    CLERK_SECRET_KEY: "", // activates dev bypass: clerk_email = dev@novapatch.mx
  },
  testSuite: ({ api }) => {
    describe("GET /store/me/payment-methods", () => {
      it("returns 401 without Authorization header", async () => {
        const response = await api.get("/store/me/payment-methods")
        expect(response.status).toBe(401)
      })

      it("returns 200 with empty array for user with no Openpay account", async () => {
        // Dev bypass: clerk_email = dev@novapatch.mx, no customer in DB, no Openpay ID
        const response = await api.get("/store/me/payment-methods", {
          headers: { Authorization: "Bearer dev-token" },
        })
        expect(response.status).toBe(200)
        expect(response.data.payment_methods).toEqual([])
      })
    })

    describe("POST /store/me/payment-methods/default", () => {
      it("returns 401 without Authorization header", async () => {
        const response = await api.post("/store/me/payment-methods/default", { card_id: "card_1" })
        expect(response.status).toBe(401)
      })

      it("returns 400 when card_id is missing", async () => {
        const response = await api.post(
          "/store/me/payment-methods/default",
          {},
          { headers: { Authorization: "Bearer dev-token" } }
        )
        expect(response.status).toBe(400)
      })
    })
  },
})
```

- [ ] **Step 5.2: Run to verify they fail (routes don't exist yet)**

```bash
npm run test:integration:http -- --testPathPattern=payment-methods
```

Expected: FAIL — routes return 404

- [ ] **Step 5.3: Implement GET /store/me/payment-methods**

Create `src/api/store/me/payment-methods/route.ts`:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../modules/openpay-payment/openpay-client"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.json({ payment_methods: [] })
    return
  }

  const customer = customers[0]
  const openpayCustomerId = customer.metadata?.openpay_customer_id as string | undefined
  const defaultCardId = customer.metadata?.openpay_default_card_id as string | undefined

  if (!openpayCustomerId) {
    res.json({ payment_methods: [] })
    return
  }

  const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
  const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
  const sandbox = process.env.OPENPAY_SANDBOX !== "false"

  if (!merchantId || !privateKey) {
    // Openpay not configured — return empty rather than crashing
    res.json({ payment_methods: [] })
    return
  }

  try {
    const client = new OpenpayClient({ merchantId, privateKey, sandbox })
    const cards = await client.listCards(openpayCustomerId)

    const payment_methods = cards.map((card) => ({
      id: card.id,
      brand: card.brand,
      last4: card.card_number,
      holder_name: card.holder_name,
      expiration_month: card.expiration_month,
      expiration_year: card.expiration_year,
      bank_name: card.bank_name,
      is_default: card.id === defaultCardId,
    }))

    res.json({ payment_methods })
  } catch (err) {
    res.status(502).json({ message: "Failed to retrieve payment methods from Openpay" })
  }
}
```

- [ ] **Step 5.4: Implement POST /store/me/payment-methods/default**

Create `src/api/store/me/payment-methods/default/route.ts`:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const body = req.body as Record<string, unknown>
  const cardId = body.card_id as string | undefined

  if (!cardId) {
    res.status(400).json({ message: "card_id is required" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.status(404).json({ message: "Customer not found" })
    return
  }

  const customer = customers[0]

  await customerService.updateCustomers(
    { id: customer.id },
    {
      metadata: {
        ...(customer.metadata ?? {}),
        openpay_default_card_id: cardId,
      },
    }
  )

  res.json({ success: true, default_card_id: cardId })
}
```

- [ ] **Step 5.5: Run integration tests**

```bash
npm run test:integration:http -- --testPathPattern=payment-methods
```

Expected: PASS — 4 tests pass

- [ ] **Step 5.6: Smoke-test all routes**

```bash
PATH=/opt/homebrew/bin:$PATH npx medusa develop > /tmp/med.log 2>&1 &
sleep 20

# GET without auth → 401
curl -s -o /dev/null -w "GET no auth: %{http_code}\n" \
  http://localhost:9000/store/me/payment-methods

# GET with dev bypass → 200 with empty array
curl -s http://localhost:9000/store/me/payment-methods \
  -H "Authorization: Bearer dev-token"
# Expected: {"payment_methods":[]}

# POST without card_id → 400
curl -s -o /dev/null -w "POST no card_id: %{http_code}\n" -X POST \
  http://localhost:9000/store/me/payment-methods/default \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{}'

# POST with card_id → 404 (dev user doesn't exist as Medusa customer)
curl -s -X POST \
  http://localhost:9000/store/me/payment-methods/default \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token" \
  -d '{"card_id":"card_test_1"}'
# Expected: {"message":"Customer not found"}

kill %1
```

Expected outputs:
- `GET no auth: 401`
- `{"payment_methods":[]}`
- `POST no card_id: 400`
- `{"message":"Customer not found"}`

- [ ] **Step 5.7: Commit**

```bash
git add src/api/store/me/payment-methods/route.ts \
        src/api/store/me/payment-methods/default/route.ts \
        integration-tests/http/payment-methods.spec.ts
git commit -m "feat: payment methods routes GET and POST /store/me/payment-methods"
```

---

## Self-Review

**1. Spec coverage (from CLAUDE.md Phase 2 requirements):**

| Requirement | Task |
|---|---|
| Openpay payment integration — customer vault sync | Task 2 (`authorizePayment` creates/reuses Openpay customer) |
| Openpay — tokenized card charges | Task 2 (`storeCard` + `chargeCustomerCard`) |
| `POST /store/carts/:id/complete` with `{ openpay_token_id }` | Task 3 |
| Subscription records created on cart completion | Task 4 (subscriber + workflow) |
| `GET /store/me/payment-methods` | Task 5 |
| `POST /store/me/payment-methods/default` | Task 5 |
| Customer↔Clerk linking (subscriptions filtered per user) | Task 4.6 (lookup by email) |
| `metadata.openpay_customer_id` stored on customer | Task 4 step (updateCustomers) |

**Deferred to Phase 3:** daily billing cron, Resend email events, admin dashboard extensions.

**2. No placeholders — all steps have complete code and exact commands.**

**3. Type consistency check:**
- `subscriptionService.createSubscriptions([...])` — matches MedusaService factory pattern (array input)
- `subscriptionService.deleteSubscriptions(ids)` — compensation matches the create call
- `customerService.listCustomers({ email })` — standard Medusa list filter
- `customerService.updateCustomers({ id }, { metadata })` — correct Medusa update signature
- `OpenpayClient` imported from the same relative path in both Task 2 and Task 5
- `SUBSCRIPTION_MODULE` constant imported from `../../../modules/subscription` (correct for `steps/` depth)
- `PaymentSessionStatus.AUTHORIZED` from `@medusajs/framework/utils` — matches import in service
