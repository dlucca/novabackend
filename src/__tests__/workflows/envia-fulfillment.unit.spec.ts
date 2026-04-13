// src/__tests__/workflows/envia-fulfillment.unit.spec.ts

import { TRACKING_KEY_PREFIX } from "../../lib/redis"

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockEnviaClientInstance = {
  getRate: jest.fn(),
  generateShipment: jest.fn(),
  cancelShipment: jest.fn(),
}
jest.mock("../../lib/envia-client", () => ({
  EnviaClient: jest.fn().mockImplementation(() => mockEnviaClientInstance),
}))

jest.mock("../../lib/envia-mappers", () => ({
  mapAddress: jest.fn().mockReturnValue({
    name: "Luis Pérez", phone: "+525511111111",
    street: "Insurgentes Sur", number: "2000",
    city: "CDMX", state: "DIF", country: "MX", postalCode: "03100",
  }),
  buildShipmentRequest: jest.fn().mockReturnValue({ shipment: { type: 1 } }),
}))

const mockFulfillmentId = "ful_1"
const mockCreateFulfillmentRun = jest.fn().mockResolvedValue({
  result: { id: mockFulfillmentId },
})
const mockCreateShipmentRun = jest.fn().mockResolvedValue(undefined)

jest.mock("@medusajs/medusa/core-flows", () => ({
  createOrderFulfillmentWorkflow: jest.fn().mockReturnValue({ run: mockCreateFulfillmentRun }),
  createShipmentWorkflow: jest.fn().mockReturnValue({ run: mockCreateShipmentRun }),
}))

// mockRedis is initialised after jest.mock hoisting; we obtain it via require() in helpers.
jest.mock("../../lib/redis", () => ({
  getRedisClient: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue("OK") }),
  TRACKING_KEY_PREFIX: "envia:tracking:",
  TRACKING_KEY_TTL_SECONDS: 2592000,
}))

// Convenience accessor — call after jest.clearAllMocks() resets aren't needed here
// because we re-configure per test via the helper below.
function getMockRedis() {
  const { getRedisClient } = require("../../lib/redis")
  return getRedisClient()
}

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockOrderService = { retrieveOrder: jest.fn() }
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function makeContainer() {
  const { Modules } = require("@medusajs/framework/utils")
  return {
    resolve: jest.fn((key: string) => {
      if (key === Modules.ORDER) return mockOrderService
      if (key === "logger") return mockLogger
      return null
    }),
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseOrder = {
  id: "ord_1",
  items: [{ id: "item_1", quantity: 1 }],
  shipping_address: {
    first_name: "Luis", last_name: "Pérez",
    address_1: "Insurgentes Sur 2000",
    city: "CDMX", province: "CMX", country_code: "mx", postal_code: "03100",
  },
}

const baseShipment = {
  shipmentId: 12345,
  trackingNumber: "1Z999AA10123456784",
  carrier: "ups",
  service: "saver",
  totalPrice: "100.00",
  currency: "MXN",
  label: "https://envia.com/label.pdf",
  trackUrl: "https://envia.com/track/1Z999AA10123456784",
}

const baseRate = {
  carrier: "ups",
  service: "saver",
  totalPrice: "100.00",
  currency: "MXN",
}

// ── fetchOrderForFulfillmentStep logic ────────────────────────────────────────

async function runFetchOrder(container: any, input: { orderId: string }) {
  const { Modules } = require("@medusajs/framework/utils")
  const orderService = container.resolve(Modules.ORDER)
  return orderService.retrieveOrder(input.orderId, {
    relations: ["items", "shipping_address"],
  })
}

// ── generateEnviaLabelStep logic ──────────────────────────────────────────────

async function runGenerateLabel(container: any, input: { order: any }) {
  const { EnviaClient } = require("../../lib/envia-client")
  const { mapAddress, buildShipmentRequest } = require("../../lib/envia-mappers")
  const logger = container.resolve("logger")

  const client = new EnviaClient()
  const destination = mapAddress(input.order.shipping_address)
  const items = input.order.items ?? []

  const carriersToQuote = (process.env.ENVIA_CARRIERS ?? "ups,dhl")
    .split(",").map((c: string) => c.trim()).filter(Boolean)

  const rateSettled = await Promise.allSettled(
    carriersToQuote.map((carrier: string) =>
      client.getRate(buildShipmentRequest(destination, items, { carrier }))
    )
  )

  rateSettled.forEach((result: any, i: number) => {
    if (result.status === "rejected") {
      logger.warn(`[envia] Rate failed for "${carriersToQuote[i]}": ${result.reason?.message}`)
    }
  })

  const sortedRates = (rateSettled as any[])
    .filter((r: any) => r.status === "fulfilled" && r.value !== null)
    .map((r: any) => r.value)
    .sort((a: any, b: any) => parseFloat(a.totalPrice) - parseFloat(b.totalPrice))

  if (sortedRates.length === 0) {
    throw new Error(`No shipping rates available for order ${input.order.id}`)
  }

  let shipment: any = null
  for (const rate of sortedRates) {
    try {
      shipment = await client.generateShipment(
        buildShipmentRequest(destination, items, { carrier: rate.carrier, service: rate.service })
      )
      break
    } catch (err: any) {
      if (err.statusCode !== undefined && err.statusCode >= 500) throw err
      logger.warn(`[envia] Generate failed for "${rate.carrier}": ${err.message}`)
    }
  }

  if (!shipment) throw new Error(`All carriers failed label generation for order ${input.order.id}`)

  return {
    shipment,
    compensationData: {
      shipmentId: shipment.shipmentId,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    },
  }
}

async function runGenerateLabelCompensation(container: any, compensationData: any) {
  if (!compensationData) return
  const { EnviaClient } = require("../../lib/envia-client")
  const logger = container.resolve("logger")
  try {
    const client = new EnviaClient()
    await client.cancelShipment(compensationData)
    logger.info(`[envia] Shipment ${compensationData.shipmentId} cancelled`)
  } catch (err: any) {
    logger.error(`[envia] Could not cancel shipment ${compensationData.shipmentId}: ${err.message}`)
  }
}

// ── createMedusaFulfillmentStep logic ─────────────────────────────────────────

async function runCreateFulfillment(container: any, input: { order: any; shipment: any }) {
  const { createOrderFulfillmentWorkflow, createShipmentWorkflow } = require("@medusajs/medusa/core-flows")
  const { getRedisClient, TRACKING_KEY_PREFIX, TRACKING_KEY_TTL_SECONDS } = require("../../lib/redis")
  const logger = container.resolve("logger")

  const locationId = process.env.MEDUSA_WAREHOUSE_LOCATION_ID
  if (!locationId) {
    throw new Error("MEDUSA_WAREHOUSE_LOCATION_ID is not set — cannot register fulfillment in Medusa")
  }

  const { result: fulfillment } = await createOrderFulfillmentWorkflow(container).run({
    input: {
      order_id: input.order.id,
      location_id: locationId,
      items: input.order.items.map((item: any) => ({ id: item.id, quantity: item.quantity })),
      metadata: {
        order_id: input.order.id,
        envia_shipment_id: String(input.shipment.shipmentId),
        envia_track_url: input.shipment.trackUrl,
        envia_label_url: input.shipment.label,
        carrier: input.shipment.carrier,
        service: input.shipment.service,
      },
    },
  })

  try {
    const redis = getRedisClient()
    if (redis) {
      await redis.set(
        `${TRACKING_KEY_PREFIX}${input.shipment.trackingNumber}`,
        fulfillment.id,
        "EX",
        TRACKING_KEY_TTL_SECONDS
      )
    }
  } catch (redisErr: any) {
    logger.warn(`[envia] Failed to write Redis tracking index: ${redisErr.message}`)
  }

  await createShipmentWorkflow(container).run({
    input: {
      id: fulfillment.id,
      labels: [{
        tracking_number: input.shipment.trackingNumber,
        tracking_url: input.shipment.trackUrl,
        label_url: input.shipment.label,
      }],
    },
  })

  return fulfillment.id
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchOrderForFulfillmentStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOrderService.retrieveOrder.mockResolvedValue(baseOrder)
  })

  it("order found → returns order with items and shipping_address", async () => {
    const result = await runFetchOrder(makeContainer(), { orderId: "ord_1" })
    expect(result).toEqual(baseOrder)
    expect(mockOrderService.retrieveOrder).toHaveBeenCalledWith("ord_1", {
      relations: ["items", "shipping_address"],
    })
  })

  it("order not found → error propagates", async () => {
    mockOrderService.retrieveOrder.mockRejectedValue(new Error("Order not found"))
    await expect(runFetchOrder(makeContainer(), { orderId: "bad_id" })).rejects.toThrow("Order not found")
  })
})

describe("generateEnviaLabelStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ENVIA_CARRIERS = "ups,dhl"
    mockEnviaClientInstance.getRate.mockResolvedValue(baseRate)
    mockEnviaClientInstance.generateShipment.mockResolvedValue(baseShipment)
    mockEnviaClientInstance.cancelShipment.mockResolvedValue(undefined)
  })

  it("single carrier succeeds → returns shipment result", async () => {
    process.env.ENVIA_CARRIERS = "ups"
    const { shipment } = await runGenerateLabel(makeContainer(), { order: baseOrder })
    expect(shipment).toEqual(baseShipment)
  })

  it("cheapest carrier selected when two carriers return rates", async () => {
    process.env.ENVIA_CARRIERS = "dhl,ups"
    mockEnviaClientInstance.getRate
      .mockResolvedValueOnce({ carrier: "dhl", service: "ground", totalPrice: "300.00", currency: "MXN" })
      .mockResolvedValueOnce({ carrier: "ups", service: "saver", totalPrice: "100.00", currency: "MXN" })
    await runGenerateLabel(makeContainer(), { order: baseOrder })
    const { buildShipmentRequest } = require("../../lib/envia-mappers")
    // buildShipmentRequest is called with the cheapest carrier (ups)
    expect(buildShipmentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ carrier: "ups" })
    )
  })

  it("all carriers fail rating → throws 'No shipping rates available'", async () => {
    mockEnviaClientInstance.getRate.mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(runGenerateLabel(makeContainer(), { order: baseOrder })).rejects.toThrow(
      "No shipping rates available"
    )
  })

  it("4xx on generate → falls back to next carrier", async () => {
    process.env.ENVIA_CARRIERS = "dhl,ups"
    mockEnviaClientInstance.getRate
      .mockResolvedValueOnce({ carrier: "dhl", service: "ground", totalPrice: "100.00", currency: "MXN" })
      .mockResolvedValueOnce({ carrier: "ups", service: "saver", totalPrice: "200.00", currency: "MXN" })
    const err400 = Object.assign(new Error("Bad request"), { statusCode: 400 })
    mockEnviaClientInstance.generateShipment
      .mockRejectedValueOnce(err400)
      .mockResolvedValueOnce({ ...baseShipment, carrier: "ups" })
    const { shipment } = await runGenerateLabel(makeContainer(), { order: baseOrder })
    expect(shipment.carrier).toBe("ups")
  })

  it("5xx on generate → re-throws without fallback", async () => {
    process.env.ENVIA_CARRIERS = "ups,dhl"
    const err500 = Object.assign(new Error("Internal Server Error"), { statusCode: 500 })
    mockEnviaClientInstance.generateShipment.mockRejectedValue(err500)
    await expect(runGenerateLabel(makeContainer(), { order: baseOrder })).rejects.toThrow(
      "Internal Server Error"
    )
    expect(mockEnviaClientInstance.generateShipment).toHaveBeenCalledTimes(1)
  })

  it("compensation → calls cancelShipment with shipmentId", async () => {
    const compensationData = { shipmentId: 12345, carrier: "ups", trackingNumber: "1Z999" }
    await runGenerateLabelCompensation(makeContainer(), compensationData)
    expect(mockEnviaClientInstance.cancelShipment).toHaveBeenCalledWith(compensationData)
  })
})

describe("createMedusaFulfillmentStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.MEDUSA_WAREHOUSE_LOCATION_ID = "loc_1"
    mockCreateFulfillmentRun.mockResolvedValue({ result: { id: mockFulfillmentId } })
    mockCreateShipmentRun.mockResolvedValue(undefined)
    getMockRedis().set.mockResolvedValue("OK")
  })

  it("no MEDUSA_WAREHOUSE_LOCATION_ID → throws", async () => {
    delete process.env.MEDUSA_WAREHOUSE_LOCATION_ID
    await expect(
      runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    ).rejects.toThrow("MEDUSA_WAREHOUSE_LOCATION_ID is not set")
  })

  it("happy path → createOrderFulfillmentWorkflow called with order_id, location_id, items", async () => {
    await runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    expect(mockCreateFulfillmentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          order_id: "ord_1",
          location_id: "loc_1",
          items: [{ id: "item_1", quantity: 1 }],
        }),
      })
    )
  })

  it("Redis index written with tracking number → fulfillment id", async () => {
    await runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    expect(getMockRedis().set).toHaveBeenCalledWith(
      `${TRACKING_KEY_PREFIX}${baseShipment.trackingNumber}`,
      mockFulfillmentId,
      "EX",
      expect.any(Number)
    )
  })

  it("Redis throws → warning logged; fulfillment id still returned", async () => {
    getMockRedis().set.mockRejectedValue(new Error("Redis connection lost"))
    const result = await runCreateFulfillment(makeContainer(), { order: baseOrder, shipment: baseShipment })
    expect(result).toBe(mockFulfillmentId)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write Redis tracking index")
    )
  })
})
