# Argentina Etapa 2 — MercadoPago Payment Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom Medusa payment provider for MercadoPago that mirrors the existing Openpay module, enabling ARS card tokenization and server-to-server charges for Argentina customers.

**Architecture:** Four files mirroring `src/modules/openpay-payment/`: a REST client (`mercadopago-client.ts`), a Medusa `AbstractPaymentProvider` service (`service.ts`), a module entry point (`index.ts`), and a one-off region update script. The payment flow is triangular (PCI-DSS): the frontend tokenizes the card with the MP JS SDK, Medusa receives the token, charges server-to-server. Saved cards are stored in the MP customer vault; `customer.metadata.mp_customer_id` is the vault key.

**Tech Stack:** MercadoPago REST API v1, Medusa `AbstractPaymentProvider`, `fetch`, Jest

---

## MP API Reference

| Action | Endpoint |
|--------|----------|
| Search customer by email | `GET /v1/customers/search?email={email}` |
| Create customer | `POST /v1/customers` |
| Save card | `POST /v1/customers/{id}/cards` body: `{ token }` |
| List cards | `GET /v1/customers/{id}/cards` |
| Get card token (recurring) | `POST /v1/customers/{id}/cards/{card_id}/token` |
| Charge | `POST /v1/payments` |
| Refund | `POST /v1/payments/{id}/refunds` |

Auth: `Authorization: Bearer {accessToken}` on all requests.

Sandbox base URL: `https://api.mercadopago.com` (same host — sandbox is determined by test credentials).

---

## File Map

| File | Action |
|------|--------|
| `src/modules/mercadopago-payment/mercadopago-client.ts` | Create |
| `src/modules/mercadopago-payment/service.ts` | Create |
| `src/modules/mercadopago-payment/index.ts` | Create |
| `src/modules/mercadopago-payment/__tests__/mercadopago-client.unit.spec.ts` | Create |
| `src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts` | Create |
| `src/scripts/update-ar-payment-provider.ts` | Create |
| `medusa-config.ts` | Modify — add MP provider |
| `src/api/store/me/payment-methods/route.ts` | Modify — add `region_id` routing |

---

## Task 1: Create branch

- [ ] **Step 1: Create branch from etapa1**

```bash
git checkout feat/argentina-etapa1-region
git checkout -b feat/argentina-etapa2-mercadopago
```

---

## Task 2: Write failing tests for `MercadoPagoClient`

**Files:**
- Create: `src/modules/mercadopago-payment/__tests__/mercadopago-client.unit.spec.ts`

- [ ] **Step 1: Create test file**

```typescript
// src/modules/mercadopago-payment/__tests__/mercadopago-client.unit.spec.ts
import { MercadoPagoClient } from "../mercadopago-client"

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

function fail(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  })
}

describe("MercadoPagoClient", () => {
  let client: MercadoPagoClient

  beforeEach(() => {
    client = new MercadoPagoClient({ accessToken: "TEST-token-123", sandbox: true })
    mockFetch.mockReset()
  })

  describe("constructor", () => {
    it("uses https://api.mercadopago.com as base URL", async () => {
      mockFetch.mockReturnValue(ok({ results: [] }))
      await client.searchCustomerByEmail("a@test.com")
      expect(mockFetch.mock.calls[0][0]).toContain("https://api.mercadopago.com")
    })

    it("sends Bearer auth header", async () => {
      mockFetch.mockReturnValue(ok({ results: [] }))
      await client.searchCustomerByEmail("a@test.com")
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer TEST-token-123")
    })
  })

  describe("searchCustomerByEmail", () => {
    it("returns null when no results", async () => {
      mockFetch.mockReturnValue(ok({ results: [] }))
      const result = await client.searchCustomerByEmail("none@test.com")
      expect(result).toBeNull()
    })

    it("returns first customer when found", async () => {
      const customer = { id: "cust_1", email: "a@test.com", first_name: "Ana", last_name: "Lopez" }
      mockFetch.mockReturnValue(ok({ results: [customer] }))
      const result = await client.searchCustomerByEmail("a@test.com")
      expect(result).toEqual(customer)
    })

    it("GETs /v1/customers/search with email param", async () => {
      mockFetch.mockReturnValue(ok({ results: [] }))
      await client.searchCustomerByEmail("test@example.com")
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.mercadopago.com/v1/customers/search?email=test%40example.com"
      )
    })
  })

  describe("createCustomer", () => {
    it("POSTs to /v1/customers", async () => {
      mockFetch.mockReturnValue(ok({ id: "cust_1", email: "a@test.com", first_name: "Ana", last_name: "Lopez" }))
      await client.createCustomer({ email: "a@test.com", first_name: "Ana", last_name: "Lopez" })
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/customers")
      expect(mockFetch.mock.calls[0][1].method).toBe("POST")
    })

    it("returns created customer", async () => {
      const customer = { id: "cust_1", email: "a@test.com", first_name: "Ana", last_name: "Lopez" }
      mockFetch.mockReturnValue(ok(customer))
      const result = await client.createCustomer({ email: "a@test.com", first_name: "Ana", last_name: "Lopez" })
      expect(result).toEqual(customer)
    })
  })

  describe("getOrCreateCustomer", () => {
    it("returns existing customer without creating", async () => {
      const customer = { id: "cust_existing", email: "a@test.com", first_name: "Ana", last_name: "Lopez" }
      mockFetch.mockReturnValueOnce(ok({ results: [customer] }))
      const result = await client.getOrCreateCustomer({ email: "a@test.com", first_name: "Ana", last_name: "Lopez" })
      expect(result.id).toBe("cust_existing")
      expect(mockFetch).toHaveBeenCalledTimes(1) // only the search, no create
    })

    it("creates customer when not found", async () => {
      const newCustomer = { id: "cust_new", email: "new@test.com", first_name: "Juan", last_name: "Perez" }
      mockFetch
        .mockReturnValueOnce(ok({ results: [] }))         // search → not found
        .mockReturnValueOnce(ok(newCustomer))              // create → returns customer
      const result = await client.getOrCreateCustomer({ email: "new@test.com", first_name: "Juan", last_name: "Perez" })
      expect(result.id).toBe("cust_new")
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("createCard", () => {
    it("POSTs to /v1/customers/:id/cards with token", async () => {
      mockFetch.mockReturnValue(ok({ id: "card_1", last_four_digits: "4321", first_six_digits: "411111", expiration_month: 12, expiration_year: 2028, payment_method: { id: "visa", name: "Visa" }, cardholder: { name: "Ana Lopez" } }))
      await client.createCard("cust_1", "card_token_abc")
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/customers/cust_1/cards")
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toEqual({ token: "card_token_abc" })
    })
  })

  describe("listCards", () => {
    it("GETs /v1/customers/:id/cards", async () => {
      mockFetch.mockReturnValue(ok([]))
      await client.listCards("cust_1")
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/customers/cust_1/cards")
      expect(mockFetch.mock.calls[0][1].method).toBe("GET")
    })
  })

  describe("getCardToken", () => {
    it("POSTs to /v1/customers/:id/cards/:card_id/token", async () => {
      mockFetch.mockReturnValue(ok({ id: "charge_token_xyz" }))
      const token = await client.getCardToken("cust_1", "card_1")
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.mercadopago.com/v1/customers/cust_1/cards/card_1/token"
      )
      expect(token).toBe("charge_token_xyz")
    })
  })

  describe("charge", () => {
    it("POSTs to /v1/payments", async () => {
      mockFetch.mockReturnValue(ok({ id: 12345, status: "approved", status_detail: "accredited", transaction_amount: 60000, currency_id: "ARS" }))
      await client.charge({
        token: "charge_token_abc",
        amount: 60000,
        currencyCode: "ARS",
        description: "Novapatch order",
        mpCustomerId: "cust_1",
      })
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments")
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.transaction_amount).toBe(60000)
      expect(body.currency_id).toBe("ARS")
      expect(body.token).toBe("charge_token_abc")
      expect(body.installments).toBe(1)
    })

    it("returns payment on success", async () => {
      const payment = { id: 12345, status: "approved", status_detail: "accredited", transaction_amount: 60000, currency_id: "ARS" }
      mockFetch.mockReturnValue(ok(payment))
      const result = await client.charge({ token: "tok", amount: 60000, currencyCode: "ARS", description: "test", mpCustomerId: "cust_1" })
      expect(result.id).toBe(12345)
      expect(result.status).toBe("approved")
    })

    it("throws on rejected payment", async () => {
      mockFetch.mockReturnValue(ok({ id: 99, status: "rejected", status_detail: "cc_rejected_insufficient_amount", transaction_amount: 60000, currency_id: "ARS" }))
      await expect(
        client.charge({ token: "tok", amount: 60000, currencyCode: "ARS", description: "test", mpCustomerId: "cust_1" })
      ).rejects.toThrow("cc_rejected_insufficient_amount")
    })
  })

  describe("refund", () => {
    it("POSTs to /v1/payments/:id/refunds", async () => {
      mockFetch.mockReturnValue(ok({ id: 99, status: "approved" }))
      await client.refund("12345")
      expect(mockFetch.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/payments/12345/refunds")
      expect(mockFetch.mock.calls[0][1].method).toBe("POST")
    })

    it("sends amount if provided", async () => {
      mockFetch.mockReturnValue(ok({}))
      await client.refund("12345", 30000)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.amount).toBe(30000)
    })
  })

  describe("error handling", () => {
    it("throws with MP message on non-2xx", async () => {
      mockFetch.mockReturnValue(fail(400, { message: "Invalid token" }))
      await expect(client.createCustomer({ email: "a@b.com", first_name: "A", last_name: "B" }))
        .rejects.toThrow("Invalid token")
    })

    it("throws with status fallback when error body is not JSON", async () => {
      mockFetch.mockReturnValue(Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.reject(new SyntaxError("bad json")),
      }))
      await expect(client.createCustomer({ email: "a@b.com", first_name: "A", last_name: "B" }))
        .rejects.toThrow("MercadoPago error 503")
    })
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx jest src/modules/mercadopago-payment/__tests__/mercadopago-client.unit.spec.ts --no-coverage
```

Expected: `Cannot find module '../mercadopago-client'`

---

## Task 3: Implement `MercadoPagoClient`

**Files:**
- Create: `src/modules/mercadopago-payment/mercadopago-client.ts`

- [ ] **Step 1: Create the client**

```typescript
// src/modules/mercadopago-payment/mercadopago-client.ts

export type MPCustomer = {
  id: string
  email: string
  first_name: string
  last_name: string
}

export type MPCard = {
  id: string
  first_six_digits: string
  last_four_digits: string
  expiration_month: number
  expiration_year: number
  payment_method: { id: string; name: string }  // e.g. { id: "visa", name: "Visa" }
  cardholder: { name: string }
}

export type MPPayment = {
  id: number
  status: "approved" | "pending" | "rejected" | "cancelled" | "refunded" | "charged_back" | "in_process" | "authorized"
  status_detail: string
  transaction_amount: number
  currency_id: string
}

type ClientOptions = {
  accessToken: string
  sandbox: boolean  // reserved for future use — MP uses same host for sandbox/prod
}

export class MercadoPagoClient {
  private readonly baseUrl = "https://api.mercadopago.com"
  private readonly authHeader: string

  constructor(options: ClientOptions) {
    this.authHeader = `Bearer ${options.accessToken}`
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

    if (!response.ok) {
      let message = `MercadoPago error ${response.status}`
      try {
        const err = await response.json() as { message?: string; error?: string }
        if (err.message) message = err.message
        else if (err.error) message = err.error
      } catch { /* non-JSON body — use the status fallback */ }
      throw new Error(message)
    }

    return await response.json() as T
  }

  async searchCustomerByEmail(email: string): Promise<MPCustomer | null> {
    const encoded = encodeURIComponent(email)
    const result = await this.request<{ results: MPCustomer[] }>(
      "GET",
      `/v1/customers/search?email=${encoded}`
    )
    return result.results[0] ?? null
  }

  async createCustomer(params: { email: string; first_name: string; last_name: string }): Promise<MPCustomer> {
    return this.request<MPCustomer>("POST", "/v1/customers", params)
  }

  async getOrCreateCustomer(params: { email: string; first_name: string; last_name: string }): Promise<MPCustomer> {
    const existing = await this.searchCustomerByEmail(params.email)
    if (existing) return existing
    return this.createCustomer(params)
  }

  async createCard(customerId: string, cardToken: string): Promise<MPCard> {
    return this.request<MPCard>("POST", `/v1/customers/${customerId}/cards`, { token: cardToken })
  }

  async listCards(customerId: string): Promise<MPCard[]> {
    return this.request<MPCard[]>("GET", `/v1/customers/${customerId}/cards`)
  }

  // Gets a charge token from a saved card (for recurring billing — no CVV required)
  async getCardToken(customerId: string, cardId: string): Promise<string> {
    const result = await this.request<{ id: string }>(
      "POST",
      `/v1/customers/${customerId}/cards/${cardId}/token`,
      {}
    )
    return result.id
  }

  async charge(params: {
    token: string
    amount: number        // major units (pesos argentinos)
    currencyCode: string  // "ARS"
    description: string
    mpCustomerId: string
    externalReference?: string
  }): Promise<MPPayment> {
    const payment = await this.request<MPPayment>("POST", "/v1/payments", {
      token: params.token,
      transaction_amount: params.amount,
      currency_id: params.currencyCode.toUpperCase(),
      description: params.description,
      installments: 1,
      payer: { type: "customer", id: params.mpCustomerId },
      ...(params.externalReference ? { external_reference: params.externalReference } : {}),
    })

    if (payment.status === "rejected") {
      throw new Error(payment.status_detail)
    }

    return payment
  }

  async refund(paymentId: string, amount?: number): Promise<void> {
    await this.request<unknown>("POST", `/v1/payments/${paymentId}/refunds`, amount != null ? { amount } : {})
  }
}
```

- [ ] **Step 2: Run tests — confirm they pass**

```bash
npx jest src/modules/mercadopago-payment/__tests__/mercadopago-client.unit.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/modules/mercadopago-payment/mercadopago-client.ts \
        src/modules/mercadopago-payment/__tests__/mercadopago-client.unit.spec.ts
git commit -m "feat(argentina): add MercadoPagoClient with tests"
```

---

## Task 4: Write failing tests for `MercadoPagoPaymentService`

**Files:**
- Create: `src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts`

- [ ] **Step 1: Create test file**

```typescript
// src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts
import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { MercadoPagoPaymentService } from "../service"

// Mock MercadoPagoClient so tests don't hit the real API
jest.mock("../mercadopago-client", () => ({
  MercadoPagoClient: jest.fn().mockImplementation(() => ({
    getOrCreateCustomer: jest.fn(),
    createCard: jest.fn(),
    getCardToken: jest.fn(),
    charge: jest.fn(),
    listCards: jest.fn(),
    refund: jest.fn(),
  })),
}))

import { MercadoPagoClient } from "../mercadopago-client"

function makeService() {
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
  const service = new MercadoPagoPaymentService(
    { logger } as any,
    { accessToken: "TEST-token", sandbox: true }
  )
  const client = (service as any).client_ as jest.Mocked<MercadoPagoClient>
  return { service, client, logger }
}

describe("MercadoPagoPaymentService", () => {
  describe("initiatePayment", () => {
    it("returns pending status", async () => {
      const { service } = makeService()
      const result = await service.initiatePayment({})
      expect(result.data.status).toBe("pending")
    })
  })

  describe("updatePayment", () => {
    it("passes through mp_card_token and device_session_id", async () => {
      const { service } = makeService()
      const result = await service.updatePayment({
        data: { mp_card_token: "tok_abc", device_session_id: "dev_xyz" },
        amount: 60000,
        currency_code: "ars",
      })
      expect(result.data.mp_card_token).toBe("tok_abc")
      expect(result.data.device_session_id).toBe("dev_xyz")
      expect(result.data._payment_amount).toBe(60000)
      expect(result.data._currency_code).toBe("ars")
    })
  })

  describe("authorizePayment", () => {
    it("returns ERROR if mp_card_token is missing", async () => {
      const { service } = makeService()
      const result = await service.authorizePayment(
        { some: "data" },
        { amount: 60000, currency_code: "ARS", customer: { id: "cust_1", email: "a@test.com" } }
      )
      expect(result.status).toBe(PaymentSessionStatus.ERROR)
      expect(result.error).toContain("mp_card_token")
    })

    it("returns ERROR if amount is 0 or missing", async () => {
      const { service } = makeService()
      const result = await service.authorizePayment(
        { mp_card_token: "tok_abc" },
        { amount: 0, currency_code: "ARS", customer: { id: "c1", email: "a@test.com" } }
      )
      expect(result.status).toBe(PaymentSessionStatus.ERROR)
      expect(result.error).toContain("amount")
    })

    it("returns CAPTURED on successful charge", async () => {
      const { service, client } = makeService()
      ;(client.getOrCreateCustomer as jest.Mock).mockResolvedValue({ id: "mp_cust_1" })
      ;(client.createCard as jest.Mock).mockResolvedValue({ id: "card_1" })
      ;(client.charge as jest.Mock).mockResolvedValue({ id: 99999, status: "approved", status_detail: "accredited", transaction_amount: 60000, currency_id: "ARS" })

      const result = await service.authorizePayment(
        { mp_card_token: "tok_abc", _payment_amount: 60000, _currency_code: "ars" },
        { customer: { id: "cust_1", email: "a@test.com", first_name: "Ana", last_name: "Lopez" } }
      )
      expect(result.status).toBe(PaymentSessionStatus.CAPTURED)
      expect(result.data.mp_payment_id).toBe(99999)
      expect(result.data.mp_customer_id).toBe("mp_cust_1")
    })

    it("returns ERROR on charge failure", async () => {
      const { service, client } = makeService()
      ;(client.getOrCreateCustomer as jest.Mock).mockResolvedValue({ id: "mp_cust_1" })
      ;(client.createCard as jest.Mock).mockResolvedValue({ id: "card_1" })
      ;(client.charge as jest.Mock).mockRejectedValue(new Error("cc_rejected_insufficient_amount"))

      const result = await service.authorizePayment(
        { mp_card_token: "tok_abc", _payment_amount: 60000, _currency_code: "ars" },
        { customer: { id: "c1", email: "a@test.com" } }
      )
      expect(result.status).toBe(PaymentSessionStatus.ERROR)
      expect(result.error).toContain("cc_rejected_insufficient_amount")
    })

    it("stores mp_customer_id and mp_card_id in result data", async () => {
      const { service, client } = makeService()
      ;(client.getOrCreateCustomer as jest.Mock).mockResolvedValue({ id: "mp_cust_1" })
      ;(client.createCard as jest.Mock).mockResolvedValue({ id: "card_abc" })
      ;(client.charge as jest.Mock).mockResolvedValue({ id: 88, status: "approved", status_detail: "accredited", transaction_amount: 60000, currency_id: "ARS" })

      const result = await service.authorizePayment(
        { mp_card_token: "tok_abc", _payment_amount: 60000, _currency_code: "ars" },
        { customer: { id: "c1", email: "a@test.com" } }
      )
      expect(result.data.mp_card_id).toBe("card_abc")
      expect(result.data.mp_customer_id).toBe("mp_cust_1")
    })

    it("reuses existing mp_customer_id from customer metadata", async () => {
      const { service, client } = makeService()
      ;(client.createCard as jest.Mock).mockResolvedValue({ id: "card_1" })
      ;(client.charge as jest.Mock).mockResolvedValue({ id: 77, status: "approved", status_detail: "accredited", transaction_amount: 60000, currency_id: "ARS" })

      await service.authorizePayment(
        { mp_card_token: "tok_abc", _payment_amount: 60000, _currency_code: "ars" },
        { customer: { id: "c1", email: "a@test.com", metadata: { mp_customer_id: "existing_mp_cust" } } }
      )
      // getOrCreateCustomer should NOT be called when mp_customer_id exists in metadata
      expect(client.getOrCreateCustomer).not.toHaveBeenCalled()
      expect(client.createCard).toHaveBeenCalledWith("existing_mp_cust", "tok_abc")
    })
  })

  describe("capturePayment", () => {
    it("is a no-op — returns existing data", async () => {
      const { service } = makeService()
      const result = await service.capturePayment({ data: { mp_payment_id: 123 } })
      expect(result.data.mp_payment_id).toBe(123)
    })
  })

  describe("cancelPayment", () => {
    it("calls refund if mp_payment_id is present", async () => {
      const { service, client } = makeService()
      ;(client.refund as jest.Mock).mockResolvedValue(undefined)
      await service.cancelPayment({ data: { mp_payment_id: 9876 } })
      expect(client.refund).toHaveBeenCalledWith("9876")
    })

    it("is a no-op if mp_payment_id is missing", async () => {
      const { service, client } = makeService()
      await service.cancelPayment({ data: {} })
      expect(client.refund).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx jest src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts --no-coverage
```

Expected: `Cannot find module '../service'`

---

## Task 5: Implement `MercadoPagoPaymentService`

**Files:**
- Create: `src/modules/mercadopago-payment/service.ts`

- [ ] **Step 1: Create service**

```typescript
// src/modules/mercadopago-payment/service.ts
import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"
import { MercadoPagoClient } from "./mercadopago-client"

type Options = {
  accessToken: string
  sandbox?: boolean
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

export class MercadoPagoPaymentService extends AbstractPaymentProvider<Options> {
  static identifier = "mercadopago"

  protected logger_: Logger
  protected client_: MercadoPagoClient

  constructor(container: InjectedDeps, options: Options) {
    super(container as any, options)
    this.logger_ = container.logger
    this.client_ = new MercadoPagoClient({
      accessToken: options.accessToken,
      sandbox: options.sandbox ?? true,
    })
  }

  async initiatePayment(_input: any): Promise<any> {
    return { data: { status: "pending" } }
  }

  async updatePayment(input: any): Promise<any> {
    // Pass through mp_card_token, device_session_id, and save amount/currency
    // for use in authorizePayment (which doesn't always receive them from context).
    const data = { ...(input?.data ?? {}) }
    if (input?.amount != null) data._payment_amount = input.amount
    if (input?.currency_code) data._currency_code = input.currency_code
    return { data }
  }

  async getPaymentStatus(_input: any): Promise<any> {
    return PaymentSessionStatus.PENDING
  }

  // Supports both Medusa v2.13 single-input form and the legacy 2-arg form used in tests:
  //   v2.13:  authorizePayment({ data: sessionData, context: paymentContext })
  //   legacy: authorizePayment(sessionData, paymentContext)
  async authorizePayment(input: any, legacyContext?: any): Promise<any> {
    let paymentSessionData: Record<string, unknown>
    let ctx: PaymentContext

    if (legacyContext !== undefined) {
      paymentSessionData = input ?? {}
      ctx = legacyContext as PaymentContext
    } else {
      paymentSessionData = input?.data ?? {}
      ctx = (input?.context ?? {}) as PaymentContext
    }

    const mpCardToken = paymentSessionData.mp_card_token as string | undefined

    this.logger_.info(`[MP] authorizePayment called. token=${mpCardToken ? "present" : "NONE"}`)

    if (!mpCardToken) {
      this.logger_.error("[MP] MISSING mp_card_token")
      return { error: "Missing mp_card_token in payment session data", status: PaymentSessionStatus.ERROR, data: {} }
    }

    const customer = ctx.customer
    const amountMajor = (paymentSessionData._payment_amount as number) ?? ctx.amount ?? 0
    const currencyCode = ((paymentSessionData._currency_code as string) ?? ctx.currency_code ?? "ars").toUpperCase()

    if (amountMajor <= 0) {
      this.logger_.error(`[MP] INVALID AMOUNT: ${amountMajor}`)
      return { error: "Invalid payment amount: must be greater than 0", status: PaymentSessionStatus.ERROR, data: {} }
    }

    try {
      // Get or create MP customer
      let mpCustomerId = customer?.metadata?.mp_customer_id as string | undefined

      if (!mpCustomerId) {
        const email = (paymentSessionData._customer_email as string) ?? customer?.email ?? ""
        if (!email) {
          this.logger_.error("[MP] No customer email available")
          return { error: "Customer email is required for payment", status: PaymentSessionStatus.ERROR, data: {} }
        }

        const mpCustomer = await this.client_.getOrCreateCustomer({
          email,
          first_name: (paymentSessionData._customer_name as string) ?? customer?.first_name ?? "Customer",
          last_name: (paymentSessionData._customer_last_name as string) ?? customer?.last_name ?? "",
        })
        mpCustomerId = mpCustomer.id
      }

      // Save card token to MP vault
      const card = await this.client_.createCard(mpCustomerId, mpCardToken)

      // Charge
      const payment = await this.client_.charge({
        token: mpCardToken,
        amount: amountMajor,
        currencyCode,
        description: "Novapatch order",
        mpCustomerId,
        externalReference: paymentSessionData._order_id as string | undefined,
      })

      // MP charges are immediate — return CAPTURED
      return {
        status: PaymentSessionStatus.CAPTURED,
        data: {
          mp_payment_id: payment.id,
          mp_customer_id: mpCustomerId,
          mp_card_id: card.id,
          medusa_customer_id: customer?.id,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_.error(`[MP] authorizePayment FAILED: ${message}`)
      return { error: message, status: PaymentSessionStatus.ERROR, data: { error: message } }
    }
  }

  // MP charges are immediate — capture is a no-op
  async capturePayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    return { data }
  }

  async cancelPayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    const paymentId = data.mp_payment_id as string | number | undefined
    if (!paymentId) return { data }
    try {
      await this.client_.refund(String(paymentId))
      return { data: { ...data, mp_status: "refunded" } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_.error(`[MP] cancelPayment failed: ${message}`)
      return { error: message }
    }
  }

  async refundPayment(input: any, legacyAmount?: any): Promise<any> {
    let data: Record<string, unknown>
    let refundAmount: number

    if (legacyAmount !== undefined) {
      data = input ?? {}
      refundAmount = legacyAmount
    } else {
      data = input?.data ?? input ?? {}
      refundAmount = input?.amount ?? 0
    }

    const paymentId = data.mp_payment_id as string | number | undefined
    if (!paymentId) return { data }
    try {
      await this.client_.refund(String(paymentId), refundAmount > 0 ? refundAmount : undefined)
      return { data: { ...data, mp_status: "refunded" } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_.error(`[MP] refundPayment failed: ${message}`)
      return { error: message }
    }
  }

  async retrievePayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    return { data }
  }

  async deletePayment(_input: any): Promise<any> {
    return {}
  }

  async getWebhookActionAndData(_input: any): Promise<any> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default MercadoPagoPaymentService
```

- [ ] **Step 2: Run tests — confirm they pass**

```bash
npx jest src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/modules/mercadopago-payment/service.ts \
        src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts
git commit -m "feat(argentina): add MercadoPagoPaymentService with tests"
```

---

## Task 6: Create module entry point

**Files:**
- Create: `src/modules/mercadopago-payment/index.ts`

- [ ] **Step 1: Create index**

```typescript
// src/modules/mercadopago-payment/index.ts
import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { MercadoPagoPaymentService } from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [MercadoPagoPaymentService],
})
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/mercadopago-payment/index.ts
git commit -m "feat(argentina): add mercadopago-payment module entry point"
```

---

## Task 7: Register module in `medusa-config.ts`

**Files:**
- Modify: `medusa-config.ts`

- [ ] **Step 1: Add MP provider to payment module**

In `medusa-config.ts`, replace the `providers` array inside the payment module options:

```typescript
// medusa-config.ts — inside modules[payment].options.providers, add after the openpay entry:
{
  resolve: "./src/modules/mercadopago-payment",
  id: "mercadopago",
  options: {
    accessToken: process.env.MP_ACCESS_TOKEN ?? "",
    sandbox: process.env.NODE_ENV !== "production",
  },
},
```

The full `modules` section becomes:

```typescript
modules: [
  {
    resolve: "./src/modules/subscription",
  },
  {
    resolve: "@medusajs/medusa/fulfillment",
    options: {
      providers: [
        { resolve: "@medusajs/fulfillment-manual", id: "manual" },
      ],
    },
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
        {
          resolve: "./src/modules/mercadopago-payment",
          id: "mercadopago",
          options: {
            accessToken: process.env.MP_ACCESS_TOKEN ?? "",
            sandbox: process.env.NODE_ENV !== "production",
          },
        },
      ],
    },
  },
],
```

- [ ] **Step 2: Add `MP_ACCESS_TOKEN` to `.env` (local dev only)**

Add to your local `.env`:
```
MP_ACCESS_TOKEN=TEST-your-mp-test-access-token-here
```

Get a test access token from the MercadoPago developer dashboard: https://www.mercadopago.com.ar/developers/panel

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add medusa-config.ts
git commit -m "feat(argentina): register MercadoPago payment provider in medusa-config"
```

---

## Task 8: Write `update-ar-payment-provider.ts` script

**Files:**
- Create: `src/scripts/update-ar-payment-provider.ts`

This script is run once after Stage 2 is deployed, to switch the AR region from `pp_system_default` to `pp_mercadopago`.

- [ ] **Step 1: Create script**

```typescript
// src/scripts/update-ar-payment-provider.ts
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function updateArPaymentProvider({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionService = container.resolve(Modules.REGION)

  logger.info("[update-ar-payment-provider] Looking for Argentina region...")

  const regions = await regionService.listRegions({ name: "Argentina" })
  if (!regions.length) {
    logger.error("[update-ar-payment-provider] Argentina region not found. Run seed-argentina.ts first.")
    return
  }

  const arRegion = regions[0]
  logger.info(`[update-ar-payment-provider] Found region: ${arRegion.id}`)

  await regionService.updateRegions([{
    id: arRegion.id,
    payment_providers: [{ id: "pp_mercadopago" }],
  }])

  logger.info("[update-ar-payment-provider] Done. Argentina region now uses pp_mercadopago.")
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/update-ar-payment-provider.ts
git commit -m "feat(argentina): add script to switch AR region to pp_mercadopago"
```

---

## Task 9: Update `GET /store/me/payment-methods` for multi-provider

**Files:**
- Modify: `src/api/store/me/payment-methods/route.ts`

The current route is Openpay-only. Add `region_id` query param to route to the correct vault.

- [ ] **Step 1: Update the route**

Replace the entire file content:

```typescript
// src/api/store/me/payment-methods/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { OpenpayClient } from "../../../../modules/openpay-payment/openpay-client"
import { MercadoPagoClient } from "../../../../modules/mercadopago-payment/mercadopago-client"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const clerkEmail = (req as any).clerk_email as string | undefined

  if (!clerkEmail) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  const regionId = req.query.region_id as string | undefined
  if (!regionId) {
    res.status(400).json({ message: "region_id query param is required" })
    return
  }

  // Resolve region to determine payment provider
  const regionService = req.scope.resolve(Modules.REGION)
  let region: any
  try {
    region = await regionService.retrieveRegion(regionId)
  } catch {
    res.status(404).json({ message: "Region not found" })
    return
  }

  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerService.listCustomers({ email: clerkEmail })

  if (!customers.length) {
    res.json({ payment_methods: [] })
    return
  }

  const customer = customers[0]
  const logger = req.scope.resolve("logger")

  // Argentina (ARS) → MercadoPago vault
  if (region.currency_code === "ars") {
    const mpCustomerId = customer.metadata?.mp_customer_id as string | undefined
    if (!mpCustomerId) {
      res.json({ payment_methods: [] })
      return
    }

    const accessToken = process.env.MP_ACCESS_TOKEN ?? ""
    if (!accessToken) {
      res.json({ payment_methods: [] })
      return
    }

    try {
      const client = new MercadoPagoClient({ accessToken, sandbox: process.env.NODE_ENV !== "production" })
      const cards = await client.listCards(mpCustomerId)
      const defaultCardId = customer.metadata?.mp_default_card_id as string | undefined

      const payment_methods = cards.map((card) => ({
        id: card.id,
        brand: card.payment_method.id,   // "visa", "master", etc.
        last4: card.last_four_digits,
        exp_month: card.expiration_month,
        exp_year: card.expiration_year,
        is_default: card.id === defaultCardId,
      }))

      res.json({ payment_methods })
    } catch (err) {
      logger.error(
        `[store/me/payment-methods] MP error for customer ${mpCustomerId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      res.status(502).json({ message: "Failed to retrieve payment methods from MercadoPago" })
    }
    return
  }

  // Mexico (MXN) → Openpay vault (default)
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
    res.json({ payment_methods: [] })
    return
  }

  try {
    const client = new OpenpayClient({ merchantId, privateKey, sandbox })
    const cards = await client.listCards(openpayCustomerId)

    const payment_methods = cards.map((card) => ({
      id: card.id,
      brand: card.brand,
      last4: String(card.card_number).slice(-4),
      exp_month: Number(card.expiration_month),
      exp_year: Number(card.expiration_year),
      is_default: card.id === defaultCardId,
    }))

    res.json({ payment_methods })
  } catch (err) {
    logger.error(
      `[store/me/payment-methods] Openpay error for customer ${openpayCustomerId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    res.status(502).json({ message: "Failed to retrieve payment methods from Openpay" })
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/api/store/me/payment-methods/route.ts
git commit -m "feat(argentina): route payment-methods to MP or Openpay based on region_id"
```

---

## Task 10: Smoke test and push

- [ ] **Step 1: Start dev server**

```bash
npx medusa develop
```

Expected: server starts without errors. Check logs for `[MercadoPago]` registration.

- [ ] **Step 2: Verify MP provider is registered**

```bash
curl -s http://localhost:9000/store/payment-providers | jq '.payment_providers[].id'
```

Expected: includes `"pp_mercadopago"`.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/argentina-etapa2-mercadopago
```

- [ ] **Step 4: After deploy, run region update script**

```bash
npx medusa exec ./src/scripts/update-ar-payment-provider.ts
```

Expected: `Argentina region now uses pp_mercadopago.`
