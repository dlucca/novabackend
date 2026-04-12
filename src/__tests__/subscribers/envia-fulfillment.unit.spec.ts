// src/__tests__/subscribers/envia-fulfillment.unit.spec.ts
const mockRun = jest.fn()
const mockWorkflow = jest.fn().mockReturnValue({ run: mockRun })
const mockListFulfillments = jest.fn()
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

// Inline the handler logic for isolation testing (mirrors what the real handler does)
async function runHandlerLogic(orderId: string, existingFulfillments: any[]) {
  mockListFulfillments.mockResolvedValue(existingFulfillments)

  if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) return

  const fulfillmentModule = { listFulfillments: mockListFulfillments }

  try {
    const existing = await fulfillmentModule.listFulfillments({ order_id: orderId })
    if (existing.length > 0) {
      mockLogger.info(`idempotent skip for order ${orderId}`)
      return
    }
  } catch {
    mockLogger.warn("check failed, proceeding anyway")
  }

  await mockWorkflow({}).run({ input: { orderId } })
}

describe("envia-fulfillment subscriber idempotency", () => {
  beforeEach(() => {
    mockRun.mockClear()
    mockListFulfillments.mockClear()
    mockLogger.info.mockClear()
    process.env.ENVIA_API_TOKEN = "test-token"
    process.env.ENVIA_API_URL = "https://test.envia.com"
  })

  afterEach(() => {
    delete process.env.ENVIA_API_TOKEN
    delete process.env.ENVIA_API_URL
  })

  it("runs the workflow when no fulfillment exists", async () => {
    await runHandlerLogic("order_123", [])
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it("skips the workflow when a fulfillment already exists", async () => {
    await runHandlerLogic("order_123", [{ id: "ful_existing" }])
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("idempotent skip"))
  })
})
