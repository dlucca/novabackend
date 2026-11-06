// src/__tests__/workflows/notify-telegram.unit.spec.ts

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockMapFulfillmentToTelegramMessage = jest.fn()
jest.mock("../../lib/telegram-mappers", () => ({
  mapFulfillmentToTelegramMessage: mockMapFulfillmentToTelegramMessage,
}))

const mockSendTelegramNotification = jest.fn()
jest.mock("../../lib/telegram-client", () => ({
  sendTelegramNotification: mockSendTelegramNotification,
}))

// ── Logger mock ───────────────────────────────────────────────────────────────

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function makeContainer() {
  return {
    resolve: jest.fn((key: string) => {
      if (key === "logger") return mockLogger
      return null
    }),
  }
}

// ── Inline handler logic (mirrors notifyTelegramStep inner function) ───────────

async function runNotifyTelegram(
  input: { order: any; labelUrl: string },
  container: any
) {
  const { mapFulfillmentToTelegramMessage } = require("../../lib/telegram-mappers")
  const { sendTelegramNotification } = require("../../lib/telegram-client")

  const logger = container.resolve("logger")
  const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID

  if (!chatId) {
    logger.warn(
      "[envia-create-fulfillment] TELEGRAM_ORDERS_CHAT_ID not configured — skipping Telegram notification"
    )
    return null
  }

  try {
    const message = mapFulfillmentToTelegramMessage(input.order, input.labelUrl)
    await sendTelegramNotification(chatId, message)
    logger.info(
      `[envia-create-fulfillment] Telegram notification sent for order #${
        input.order.display_id ?? input.order.id
      }`
    )
  } catch (err) {
    logger.error(
      `[envia-create-fulfillment] Telegram notification failed for order ${
        input.order.id
      }: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return null
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseOrder = {
  id: "ord_1",
  display_id: 42,
  created_at: "2026-04-13T10:00:00.000Z",
  items: [{ id: "item_1", title: "Energy Patch", quantity: 2 }],
}

const fakeLabelUrl = "https://envia.com/label/abc.pdf"
const fakeMessage = "🚚 <b>Orden lista para envío</b>"

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("notifyTelegramStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.TELEGRAM_ORDERS_CHAT_ID = "-1001234567890"
    mockMapFulfillmentToTelegramMessage.mockReturnValue(fakeMessage)
    mockSendTelegramNotification.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.TELEGRAM_ORDERS_CHAT_ID
  })

  it("no TELEGRAM_ORDERS_CHAT_ID → logs warning and skips sendTelegramNotification", async () => {
    delete process.env.TELEGRAM_ORDERS_CHAT_ID

    await runNotifyTelegram({ order: baseOrder, labelUrl: fakeLabelUrl }, makeContainer())

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("TELEGRAM_ORDERS_CHAT_ID not configured")
    )
    expect(mockSendTelegramNotification).not.toHaveBeenCalled()
  })

  it("happy path → calls mapper and sendTelegramNotification, logs info", async () => {
    await runNotifyTelegram({ order: baseOrder, labelUrl: fakeLabelUrl }, makeContainer())

    expect(mockMapFulfillmentToTelegramMessage).toHaveBeenCalledWith(baseOrder, fakeLabelUrl)
    expect(mockSendTelegramNotification).toHaveBeenCalledWith("-1001234567890", fakeMessage)
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(`order #${baseOrder.display_id}`)
    )
  })

  it("sendTelegramNotification throws → error is caught and logged, does NOT re-throw", async () => {
    mockSendTelegramNotification.mockRejectedValue(
      new Error("Telegram sendMessage failed: 500 Internal Server Error")
    )

    await expect(
      runNotifyTelegram({ order: baseOrder, labelUrl: fakeLabelUrl }, makeContainer())
    ).resolves.toBeNull()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Telegram notification failed for order ord_1")
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Telegram sendMessage failed: 500 Internal Server Error")
    )
  })
})
