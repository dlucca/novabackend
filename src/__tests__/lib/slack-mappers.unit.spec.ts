import { mapFulfillmentToSlackBlocks } from "../../lib/slack-mappers"

const baseOrder = {
  id: "order_abc123",
  display_id: 1024,
  created_at: "2026-04-13T14:32:00.000Z",
  items: [
    { title: "Energy Patch", quantity: 1, metadata: {} },
    { title: "Sleep Patch", quantity: 2, metadata: {} },
  ],
}

const labelUrl = "https://envia.com/label/abc123.pdf"

describe("mapFulfillmentToSlackBlocks", () => {
  it("returns a non-empty array of blocks", () => {
    const blocks = mapFulfillmentToSlackBlocks(baseOrder, labelUrl)
    expect(Array.isArray(blocks)).toBe(true)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it("header text is '🚚 Orden lista para envío'", () => {
    const blocks = mapFulfillmentToSlackBlocks(baseOrder, labelUrl)
    const header = blocks.find((b) => b.type === "header") as any
    expect(header?.text?.text).toBe("🚚 Orden lista para envío")
  })

  it("includes order display_id", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain("#1024")
  })

  it("falls back to order.id when display_id is null", () => {
    const text = JSON.stringify(
      mapFulfillmentToSlackBlocks({ ...baseOrder, display_id: null }, labelUrl)
    )
    expect(text).toContain("order_abc123")
  })

  it("includes formatted date", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain("2026")
  })

  it("includes all product titles and quantities", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain("Energy Patch")
    expect(text).toContain("x1")
    expect(text).toContain("Sleep Patch")
    expect(text).toContain("x2")
  })

  it("excludes items with metadata.is_shipping", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy Patch", quantity: 1, metadata: {} },
        { title: "Envío", quantity: 1, metadata: { is_shipping: true } },
      ],
    }
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(order, labelUrl))
    expect(text).toContain("Energy Patch")
    expect(text).not.toContain("Envío")
  })

  it("shows — when items list is empty after filtering", () => {
    const order = { ...baseOrder, items: [] }
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(order, labelUrl))
    expect(text).toContain("—")
  })

  it("handles null items without throwing", () => {
    const order = { ...baseOrder, items: null }
    expect(() => mapFulfillmentToSlackBlocks(order, labelUrl)).not.toThrow()
  })

  it("includes the label URL as a Slack hyperlink", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain(labelUrl)
    expect(text).toContain("Ver etiqueta PDF")
  })

  it("does NOT include customer name, email, location, or total", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).not.toContain("Cliente")
    expect(text).not.toContain("Email")
    expect(text).not.toContain("Ubicación")
    expect(text).not.toContain("Total")
  })
})
