// src/__tests__/lib/payment-provider-router.unit.spec.ts
import { getChargeClient } from "../../lib/payment-provider-router"

describe("getChargeClient", () => {
  const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }

  const mockContainer = {
    resolve: jest.fn().mockReturnValue(mockLogger),
  }

  afterEach(() => {
    jest.clearAllMocks()
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
