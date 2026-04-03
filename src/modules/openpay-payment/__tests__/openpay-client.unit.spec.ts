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

  it("getCharge GETs /charges/:id", async () => {
    mockFetch.mockReturnValue(ok({ id: "ch_1", status: "completed", amount: 319.20, currency: "MXN" }))
    await client.getCharge("ch_1")
    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox-api.openpay.mx/v1/m123/charges/ch_1")
    expect(mockFetch.mock.calls[0][1].method).toBe("GET")
  })

  it("uses production base URL when sandbox is false", async () => {
    const prodClient = new OpenpayClient({ merchantId: "m123", privateKey: "sk_test", sandbox: false })
    mockFetch.mockReturnValue(ok([]))
    await prodClient.listCards("cust_1")
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.openpay.mx/v1/m123/customers/cust_1/cards")
  })

  it("throws with status message when error body is not JSON", async () => {
    mockFetch.mockReturnValue(Promise.resolve({
      ok: false,
      status: 503,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    }))
    await expect(client.createCustomer({ name: "A", last_name: "B", email: "a@b.com" }))
      .rejects.toThrow("Openpay error 503")
  })
})
