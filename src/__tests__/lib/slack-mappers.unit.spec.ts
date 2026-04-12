import { mapOrderToSlackBlocks } from "../../lib/slack-mappers"

const baseOrder = {
  id: "order_abc123",
  display_id: 1024,
  created_at: "2026-04-12T13:42:00.000Z",
  email: "juan@example.com",
  currency_code: "mxn",
  total: 150000,
  shipping_address: {
    first_name: "Juan",
    last_name: "Pérez",
    city: "CDMX",
    province: "Ciudad de México",
    country_code: "MX",
  },
  items: [
    { title: "Energy", quantity: 1, metadata: {} },
    { title: "Sleep", quantity: 2, metadata: {} },
  ],
}

describe("mapOrderToSlackBlocks", () => {
  it("returns a non-empty array of blocks", () => {
    const blocks = mapOrderToSlackBlocks(baseOrder)
    expect(Array.isArray(blocks)).toBe(true)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it("includes order display_id in message", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("#1024")
  })

  it("falls back to order.id when display_id is null", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks({ ...baseOrder, display_id: null }))
    expect(text).toContain("order_abc123")
  })

  it("includes customer full name", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("Juan Pérez")
  })

  it("shows (sin nombre) when shipping_address is null", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks({ ...baseOrder, shipping_address: null }))
    expect(text).toContain("(sin nombre)")
  })

  it("includes email", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("juan@example.com")
  })

  it("shows (sin email) when email is null", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks({ ...baseOrder, email: null }))
    expect(text).toContain("(sin email)")
  })

  it("includes all product titles and quantities", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("Energy")
    expect(text).toContain("x1")
    expect(text).toContain("Sleep")
    expect(text).toContain("x2")
  })

  it("formats total dividing by 100", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("1,500")
  })

  it("shows currency code in uppercase", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("MXN")
  })

  it("handles non-MXN currency", () => {
    const text = JSON.stringify(
      mapOrderToSlackBlocks({ ...baseOrder, currency_code: "brl", total: 50000 })
    )
    expect(text).toContain("BRL")
    expect(text).toContain("500")
  })

  it("handles multiple items without throwing", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy", quantity: 1, metadata: {} },
        { title: "Sleep", quantity: 2, metadata: {} },
        { title: "Glow", quantity: 3, metadata: {} },
      ],
    }
    expect(() => mapOrderToSlackBlocks(order)).not.toThrow()
    const text = JSON.stringify(mapOrderToSlackBlocks(order))
    expect(text).toContain("Glow")
    expect(text).toContain("x3")
  })

  it("excludes items with metadata.is_shipping from products list", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy", quantity: 1, metadata: {} },
        { title: "Envío", quantity: 1, metadata: { is_shipping: true } },
      ],
    }
    const text = JSON.stringify(mapOrderToSlackBlocks(order))
    expect(text).toContain("Energy")
    expect(text).not.toContain("Envío")
  })
})
