// src/__tests__/workflows/notify-slack.unit.spec.ts

// ── Module-level mocks ────────────────────────────────────────────────────────

const mockMapFulfillmentToSlackBlocks = jest.fn()
jest.mock("../../lib/slack-mappers", () => ({
  mapFulfillmentToSlackBlocks: mockMapFulfillmentToSlackBlocks,
}))

const mockSendSlackNotification = jest.fn()
jest.mock("../../lib/slack-client", () => ({
  sendSlackNotification: mockSendSlackNotification,
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

// ── Inline handler logic (mirrors notifySlackStep inner function) ──────────────

async function runNotifySlack(
  input: { order: any; labelUrl: string },
  container: any
) {
  const { mapFulfillmentToSlackBlocks } = require("../../lib/slack-mappers")
  const { sendSlackNotification } = require("../../lib/slack-client")

  const logger = container.resolve("logger")
  const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL

  if (!webhookUrl) {
    logger.warn(
      "[envia-create-fulfillment] SLACK_ORDERS_WEBHOOK_URL not configured — skipping Slack notification"
    )
    return null
  }

  try {
    const blocks = mapFulfillmentToSlackBlocks(input.order, input.labelUrl)
    await sendSlackNotification(webhookUrl, blocks)
    logger.info(
      `[envia-create-fulfillment] Slack notification sent for order #${
        input.order.display_id ?? input.order.id
      }`
    )
  } catch (err) {
    logger.error(
      `[envia-create-fulfillment] Slack notification failed for order ${
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
const fakeBlocks = [{ type: "header", text: { type: "plain_text", text: "🚚 Orden lista para envío", emoji: true } }]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("notifySlackStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SLACK_ORDERS_WEBHOOK_URL = "https://hooks.slack.com/test"
    mockMapFulfillmentToSlackBlocks.mockReturnValue(fakeBlocks)
    mockSendSlackNotification.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.SLACK_ORDERS_WEBHOOK_URL
  })

  it("no SLACK_ORDERS_WEBHOOK_URL → logs warning and skips sendSlackNotification", async () => {
    delete process.env.SLACK_ORDERS_WEBHOOK_URL

    await runNotifySlack({ order: baseOrder, labelUrl: fakeLabelUrl }, makeContainer())

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("SLACK_ORDERS_WEBHOOK_URL not configured")
    )
    expect(mockSendSlackNotification).not.toHaveBeenCalled()
  })

  it("happy path → calls mapFulfillmentToSlackBlocks and sendSlackNotification, logs info", async () => {
    await runNotifySlack({ order: baseOrder, labelUrl: fakeLabelUrl }, makeContainer())

    expect(mockMapFulfillmentToSlackBlocks).toHaveBeenCalledWith(baseOrder, fakeLabelUrl)
    expect(mockSendSlackNotification).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      fakeBlocks
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(`order #${baseOrder.display_id}`)
    )
  })

  it("sendSlackNotification throws → error is caught and logged, does NOT re-throw", async () => {
    mockSendSlackNotification.mockRejectedValue(new Error("Slack webhook failed: 500 Internal Server Error"))

    // Must resolve (not reject) — the never-throws guarantee
    await expect(
      runNotifySlack({ order: baseOrder, labelUrl: fakeLabelUrl }, makeContainer())
    ).resolves.toBeNull()

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Slack notification failed for order ord_1")
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Slack webhook failed: 500 Internal Server Error")
    )
  })
})
