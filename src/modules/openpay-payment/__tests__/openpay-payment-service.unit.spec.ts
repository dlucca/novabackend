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

  describe("authorizePayment — passthrough", () => {
    it("returns CAPTURED when openpay_charge_id is present in session data (single-arg form)", async () => {
      const { svc } = makeService()
      const sessionData = {
        openpay_charge_id: "ch_123",
        openpay_customer_id: "cust_op_1",
        openpay_card_id: "card_1",
      }

      const result = await svc.authorizePayment({ data: sessionData, context: {} })

      expect(result).toEqual({
        status: "captured",
        data: expect.objectContaining({ openpay_charge_id: "ch_123" }),
      })
    })

    it("returns CAPTURED when openpay_charge_id is present (legacy 2-arg form)", async () => {
      const { svc } = makeService()
      const sessionData = { openpay_charge_id: "ch_456", openpay_customer_id: "cust_1", openpay_card_id: "card_1" }

      const result = await svc.authorizePayment(sessionData, {})

      expect(result).toEqual({
        status: "captured",
        data: expect.objectContaining({ openpay_charge_id: "ch_456" }),
      })
    })

    it("returns ERROR when openpay_charge_id is missing from session data", async () => {
      const { svc } = makeService()

      const result = await svc.authorizePayment({ data: { some: "other_data" }, context: {} })

      expect(result).toEqual(
        expect.objectContaining({
          status: "error",
          error: expect.stringContaining("openpay_charge_id"),
        })
      )
    })

    it("logs the passthrough with charge_id", async () => {
      const { svc } = makeService()
      const sessionData = { openpay_charge_id: "ch_789" }

      await svc.authorizePayment({ data: sessionData, context: {} })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("ch_789")
      )
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

  describe("cancelPayment", () => {
    it("returns error when refundCharge fails", async () => {
      const { svc, client } = makeService()
      client.refundCharge = jest.fn().mockRejectedValue(new Error("Charge already refunded"))
      const result = await svc.cancelPayment({ openpay_charge_id: "ch_1" })
      expect(result).toEqual(expect.objectContaining({ error: "Charge already refunded" }))
    })

    it("returns data when chargeId is absent", async () => {
      const { svc } = makeService()
      const data = { some: "data" }
      const result = await svc.cancelPayment(data)
      expect(result).toEqual({ data })
    })
  })

  describe("refundPayment", () => {
    it("calls refundCharge with amount in pesos", async () => {
      const { svc, client } = makeService()
      client.refundCharge = jest.fn().mockResolvedValue({ ...mockCharge, status: "refunded" })

      await svc.refundPayment({ openpay_charge_id: "ch_1" }, 31920)

      expect(client.refundCharge).toHaveBeenCalledWith("ch_1", { description: "Novapatch refund", amount: 31920 })
    })

    it("returns error when refundCharge fails", async () => {
      const { svc, client } = makeService()
      client.refundCharge = jest.fn().mockRejectedValue(new Error("Refund not allowed"))
      const result = await svc.refundPayment({ openpay_charge_id: "ch_1" }, 31920)
      expect(result).toEqual(expect.objectContaining({ error: "Refund not allowed" }))
    })

    it("returns data unchanged when chargeId is absent", async () => {
      const { svc } = makeService()
      const data = { some: "data" }
      const result = await svc.refundPayment(data, 31920)
      expect(result).toEqual({ data })
    })
  })

})
