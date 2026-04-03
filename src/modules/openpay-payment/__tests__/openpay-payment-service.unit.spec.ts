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
    it("calls refundCharge converting centavos to pesos", async () => {
      const { svc, client } = makeService()
      client.refundCharge = jest.fn().mockResolvedValue({ ...mockCharge, status: "refunded" })

      await svc.refundPayment({ openpay_charge_id: "ch_1" }, 31920)

      expect(client.refundCharge).toHaveBeenCalledWith("ch_1", { description: "Novapatch refund", amount: 319.20 })
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

  describe("authorizePayment amount guard", () => {
    it("returns error when amount is 0", async () => {
      const { svc } = makeService()
      const context = {
        amount: 0,
        currency_code: "mxn",
        customer: { id: "c1", email: "a@b.com", first_name: "A", last_name: "B", metadata: {} },
      }
      const result = await svc.authorizePayment({ status: "pending", openpay_token_id: "tok_abc" }, context as any)
      expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("amount") }))
    })
  })
})
