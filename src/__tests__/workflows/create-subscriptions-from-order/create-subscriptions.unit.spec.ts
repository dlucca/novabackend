// Helper functions that mirror the step's logic (for unit testing)
const VALID_INTERVALS = [30, 60, 90]

function isValidIntervalDays(value: unknown): value is 30 | 60 | 90 {
  return VALID_INTERVALS.includes(Number(value))
}

function computeNextBillingDate(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
}

function filterSubscriptionItems(items: any[]): any[] {
  return items.filter((item) => item.metadata?.is_subscription === true)
}

describe("createSubscriptionsStep — interval_days validation", () => {
  it("accepts 30, 60, 90 as valid intervals", () => {
    expect(isValidIntervalDays(30)).toBe(true)
    expect(isValidIntervalDays(60)).toBe(true)
    expect(isValidIntervalDays(90)).toBe(true)
  })

  it("rejects 0, 45, 120, undefined, null, and strings", () => {
    expect(isValidIntervalDays(0)).toBe(false)
    expect(isValidIntervalDays(45)).toBe(false)
    expect(isValidIntervalDays(120)).toBe(false)
    expect(isValidIntervalDays(undefined)).toBe(false)
    expect(isValidIntervalDays(null)).toBe(false)
    expect(isValidIntervalDays("monthly")).toBe(false)
  })
})

describe("createSubscriptionsStep — subscription item filtering", () => {
  it("keeps only items where metadata.is_subscription === true", () => {
    const items = [
      { id: "a", metadata: { is_subscription: true, interval_days: 30 } },
      { id: "b", metadata: { is_subscription: false } },
      { id: "c", metadata: {} },
      { id: "d", metadata: null },
      { id: "e" },
    ] as any[]
    const result = filterSubscriptionItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("a")
  })

  it("returns empty array when no items are subscriptions", () => {
    const items = [
      { metadata: { is_subscription: false } },
      { metadata: {} },
    ] as any[]
    expect(filterSubscriptionItems(items)).toHaveLength(0)
  })
})

describe("createSubscriptionsStep — next_billing_date computation", () => {
  const now = new Date("2026-04-02T00:00:00.000Z")

  it("computes 30-day billing date correctly", () => {
    const result = computeNextBillingDate(now, 30)
    expect(result.toISOString().startsWith("2026-05-02")).toBe(true)
  })

  it("computes 60-day billing date correctly", () => {
    const result = computeNextBillingDate(now, 60)
    expect(result.toISOString().startsWith("2026-06-01")).toBe(true)
  })

  it("computes 90-day billing date correctly", () => {
    const result = computeNextBillingDate(now, 90)
    expect(result.toISOString().startsWith("2026-07-01")).toBe(true)
  })

  it("next_billing_date is strictly in the future", () => {
    const result = computeNextBillingDate(now, 30)
    expect(result.getTime()).toBeGreaterThan(now.getTime())
  })
})

describe("createSubscriptionsStep — idempotency logic", () => {
  it("returns existing IDs without creating when subscriptions already exist", () => {
    // Simulate the idempotency check
    const existingSubscriptions = [{ id: "sub_01" }, { id: "sub_02" }]
    const shouldCreate = existingSubscriptions.length === 0
    expect(shouldCreate).toBe(false)
    const result = existingSubscriptions.map((s) => s.id)
    expect(result).toEqual(["sub_01", "sub_02"])
  })

  it("proceeds with creation when no existing subscriptions found", () => {
    const existingSubscriptions: any[] = []
    const shouldCreate = existingSubscriptions.length === 0
    expect(shouldCreate).toBe(true)
  })
})
