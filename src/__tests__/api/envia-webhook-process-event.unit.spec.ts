// src/__tests__/api/envia-webhook-process-event.unit.spec.ts

// ── Module-level mocks ────────────────────────────────────────────────────────

jest.mock("../../lib/redis", () => {
  const mockRedisInner = { get: jest.fn(), set: jest.fn() }
  return {
    getRedisClient: jest.fn().mockReturnValue(mockRedisInner),
    TRACKING_KEY_PREFIX: "envia:tracking:",
    TRACKING_KEY_TTL_SECONDS: 2592000,
    __mockRedis: mockRedisInner,
  }
})

jest.mock("../../lib/resend", () => ({
  renderEmail: jest.fn().mockResolvedValue("<html>email</html>"),
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))

// Mock React.createElement so OrderDelivered/OrderDeliveryFailed render without JSX runtime
jest.mock("react", () => ({
  createElement: jest.fn().mockReturnValue(null),
}))

jest.mock("../../emails/OrderDelivered", () => ({ default: "OrderDelivered" }))
jest.mock("../../emails/OrderDeliveryFailed", () => ({ default: "OrderDeliveryFailed" }))

// ── Service mocks ─────────────────────────────────────────────────────────────

var mockFulfillmentModule = {
  listFulfillments: jest.fn(),
  updateFulfillment: jest.fn(),
}
var mockOrderService = { retrieveOrder: jest.fn() }
var mockEventBus = { emit: jest.fn() }
var mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function makeContainer() {
  const { Modules } = require("@medusajs/framework/utils")
  const services: Record<string, any> = {
    [Modules.FULFILLMENT]: mockFulfillmentModule,
    [Modules.ORDER]: mockOrderService,
    [Modules.EVENT_BUS]: mockEventBus,
    logger: mockLogger,
  }
  return { resolve: jest.fn((key: string) => services[key] ?? null) }
}

// ── Import processEvent ───────────────────────────────────────────────────────

import { processEvent } from "../../api/webhooks/envia/route"
import * as resendLib from "../../lib/resend"
import * as redisLib from "../../lib/redis"

// Helper to get the inner Redis mock object created inside the factory
function getMockRedis() {
  return (redisLib as any).__mockRedis as { get: jest.Mock; set: jest.Mock }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TRACKING = "1Z999AA10123456784"
const FULFILLMENT_ID = "ful_1"
const ORDER_ID = "ord_1"

const baseFulfillment = {
  id: FULFILLMENT_ID,
  metadata: { order_id: ORDER_ID },
  labels: [{ tracking_number: TRACKING }],
}

const baseOrder = {
  id: ORDER_ID,
  email: "luis@test.com",
  display_id: "1001",
  shipping_address: { first_name: "Luis" },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("processEvent — fulfillment lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMockRedis().get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    mockEventBus.emit.mockResolvedValue(undefined)
  })

  it("Redis hit → listFulfillments called with fulfillmentId (no full scan)", async () => {
    getMockRedis().get.mockResolvedValue(FULFILLMENT_ID)
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledWith(
      { id: FULFILLMENT_ID },
      expect.objectContaining({ relations: ["labels"] })
    )
    // Should not have been called a second time (no full scan)
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledTimes(1)
  })

  it("Redis miss → full scan called (listFulfillments with empty filter)", async () => {
    getMockRedis().get.mockResolvedValue(null)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ relations: ["labels"] })
    )
  })

  it("no fulfillment found → warning logged; no throw", async () => {
    getMockRedis().get.mockResolvedValue(null)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([])
    await expect(
      processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    ).resolves.toBeUndefined()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`No fulfillment found for tracking ${TRACKING}`)
    )
  })
})

describe("processEvent — status=in_transit", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMockRedis().get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    mockEventBus.emit.mockResolvedValue(undefined)
  })

  it("emits novapatch.envia.in_transit with order_id, fulfillment_id, tracking_number", async () => {
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockEventBus.emit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "novapatch.envia.in_transit",
        data: expect.objectContaining({
          order_id: ORDER_ID,
          fulfillment_id: FULFILLMENT_ID,
          tracking_number: TRACKING,
        }),
      }),
    ])
    expect(resendLib.sendEmail).not.toHaveBeenCalled()
  })

  it("no order_id in fulfillment metadata → warning logged; no event emitted; no throw", async () => {
    mockFulfillmentModule.listFulfillments.mockResolvedValue([
      { ...baseFulfillment, metadata: {} }, // no order_id
    ])
    await processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("No order_id in fulfillment metadata")
    )
    expect(mockEventBus.emit).not.toHaveBeenCalled()
  })
})

describe("processEvent — status=delivered", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMockRedis().get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    ;(resendLib.sendEmail as jest.Mock).mockResolvedValue(undefined)
    ;(resendLib.renderEmail as jest.Mock).mockResolvedValue("<html>delivered</html>")
  })

  it("renderEmail called with OrderDelivered; sendEmail called with correct subject", async () => {
    await processEvent({ trackingNumber: TRACKING, status: "delivered" }, makeContainer())
    expect(resendLib.renderEmail).toHaveBeenCalled()
    expect(resendLib.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "luis@test.com",
        subject: expect.stringContaining("fue entregado"),
        html: "<html>delivered</html>",
      })
    )
  })
})

describe("processEvent — status=failed / returned", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMockRedis().get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
    ;(resendLib.sendEmail as jest.Mock).mockResolvedValue(undefined)
    ;(resendLib.renderEmail as jest.Mock).mockResolvedValue("<html>failed</html>")
  })

  it("status=failed → renderEmail called; sendEmail with 'Problema con la entrega' subject", async () => {
    await processEvent(
      {
        trackingNumber: TRACKING,
        status: "failed",
        events: [
          { timestamp: "2026-04-01T10:00:00Z", description: "Address not found" },
          { timestamp: "2026-04-01T12:00:00Z", description: "Delivery attempt failed" },
        ],
      },
      makeContainer()
    )
    expect(resendLib.renderEmail).toHaveBeenCalled()
    expect(resendLib.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Problema con la entrega") })
    )
  })

  it("status=returned → sendEmail called (same path as failed)", async () => {
    await processEvent({ trackingNumber: TRACKING, status: "returned" }, makeContainer())
    expect(resendLib.renderEmail).toHaveBeenCalled()
    expect(resendLib.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Problema con la entrega") })
    )
  })
})

describe("processEvent — error resilience", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getMockRedis().get.mockResolvedValue(FULFILLMENT_ID)
    mockFulfillmentModule.listFulfillments.mockResolvedValue([baseFulfillment])
    mockFulfillmentModule.updateFulfillment.mockResolvedValue(undefined)
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
  })

  it("sendEmail throws → error logged; processEvent does not throw", async () => {
    ;(resendLib.sendEmail as jest.Mock).mockRejectedValue(new Error("Resend API down"))
    ;(resendLib.renderEmail as jest.Mock).mockResolvedValue("<html>delivered</html>")
    await expect(
      processEvent({ trackingNumber: TRACKING, status: "delivered" }, makeContainer())
    ).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send delivered email")
    )
  })

  it("Redis unavailable → falls back to full scan; continues normally", async () => {
    const { getRedisClient } = require("../../lib/redis")
    ;(getRedisClient as jest.Mock).mockReturnValueOnce(null)
    mockEventBus.emit.mockResolvedValue(undefined)
    await expect(
      processEvent({ trackingNumber: TRACKING, status: "in_transit" }, makeContainer())
    ).resolves.toBeUndefined()
    // Full scan was used (no Redis)
    expect(mockFulfillmentModule.listFulfillments).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ relations: ["labels"] })
    )
  })
})
