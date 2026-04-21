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
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
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
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("creates customer when not found", async () => {
      const newCustomer = { id: "cust_new", email: "new@test.com", first_name: "Juan", last_name: "Perez" }
      mockFetch
        .mockReturnValueOnce(ok({ results: [] }))
        .mockReturnValueOnce(ok(newCustomer))
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
      expect(body.currency_id).toBeUndefined() // MP infers currency from account
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
        text: () => Promise.resolve("<html>502 Bad Gateway</html>"),
      }))
      await expect(client.createCustomer({ email: "a@b.com", first_name: "A", last_name: "B" }))
        .rejects.toThrow("MercadoPago error 503")
    })
  })
})
