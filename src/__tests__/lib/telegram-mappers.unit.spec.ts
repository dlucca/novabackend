import { mapFulfillmentToTelegramMessage } from "../../lib/telegram-mappers"

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

describe("mapFulfillmentToTelegramMessage", () => {
  it("returns a non-empty string", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(typeof msg).toBe("string")
    expect(msg.length).toBeGreaterThan(0)
  })

  it("starts with '🚚 Orden lista para envío'", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(msg).toContain("🚚")
    expect(msg).toContain("Orden lista para envío")
  })

  it("includes order display_id", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(msg).toContain("#1024")
  })

  it("falls back to order.id when display_id is null", () => {
    const msg = mapFulfillmentToTelegramMessage({ ...baseOrder, display_id: null }, labelUrl)
    expect(msg).toContain("order_abc123")
  })

  it("includes formatted date", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(msg).toContain("2026")
  })

  it("includes all product titles and quantities", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(msg).toContain("Energy Patch")
    expect(msg).toContain("x1")
    expect(msg).toContain("Sleep Patch")
    expect(msg).toContain("x2")
  })

  it("excludes items with metadata.is_shipping", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy Patch", quantity: 1, metadata: {} },
        { title: "Envío", quantity: 1, metadata: { is_shipping: true } },
      ],
    }
    const msg = mapFulfillmentToTelegramMessage(order, labelUrl)
    expect(msg).toContain("Energy Patch")
    expect(msg).not.toContain("Envío")
  })

  it("shows — when items list is empty after filtering", () => {
    const order = { ...baseOrder, items: [] }
    const msg = mapFulfillmentToTelegramMessage(order, labelUrl)
    expect(msg).toContain("—")
  })

  it("handles null items without throwing", () => {
    const order = { ...baseOrder, items: null }
    expect(() => mapFulfillmentToTelegramMessage(order, labelUrl)).not.toThrow()
  })

  it("includes the label URL as an HTML hyperlink", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(msg).toContain(labelUrl)
    expect(msg).toContain("Ver etiqueta PDF")
    expect(msg).toContain(`<a href="${labelUrl}">`)
  })

  it("does NOT include customer name, email, location, or total", () => {
    const msg = mapFulfillmentToTelegramMessage(baseOrder, labelUrl)
    expect(msg).not.toContain("Cliente")
    expect(msg).not.toContain("Email")
    expect(msg).not.toContain("Ubicación")
    expect(msg).not.toContain("Total")
  })

  it("HTML-escapes product titles", () => {
    const order = {
      ...baseOrder,
      items: [{ title: "A & B <patch>", quantity: 1, metadata: {} }],
    }
    const msg = mapFulfillmentToTelegramMessage(order, labelUrl)
    expect(msg).toContain("A &amp; B &lt;patch&gt;")
  })
})
