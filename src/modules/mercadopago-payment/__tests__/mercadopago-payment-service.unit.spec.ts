// src/modules/mercadopago-payment/__tests__/mercadopago-payment-service.unit.spec.ts
import { PaymentSessionStatus } from "@medusajs/framework/utils"
import { MercadoPagoPaymentService } from "../service"

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
