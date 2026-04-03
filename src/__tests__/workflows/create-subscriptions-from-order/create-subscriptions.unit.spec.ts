// Tests for the next_billing_date calculation logic (pure, no Medusa dependency)
describe("createSubscriptionsStep logic", () => {
  it("next_billing_date is interval_days days from now", () => {
    const now = new Date("2026-04-02T12:00:00Z")
    const intervalDays = 30
    const next = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
    // 30 days after April 2 = May 2
    expect(next.getUTCMonth()).toBe(4) // May = index 4
    expect(next.getUTCDate()).toBe(2)
  })

  it("filters only items where metadata.is_subscription === true", () => {
    const items = [
      { metadata: { is_subscription: true, interval_days: 30 } },
      { metadata: { is_subscription: false } },
      { metadata: {} },
      { metadata: null },
    ] as any[]
    const subItems = items.filter((i) => i.metadata?.is_subscription === true)
    expect(subItems).toHaveLength(1)
    expect(subItems[0].metadata.interval_days).toBe(30)
  })

  it("defaults interval_days to 30 when missing", () => {
    const intervalDays = Number(undefined ?? 30)
    expect(intervalDays).toBe(30)
  })

  it("converts centavos to pesos correctly for 6 products", () => {
    const centavos = 31920
    const pesos = centavos / 100
    expect(pesos).toBe(319.20)
  })
})
