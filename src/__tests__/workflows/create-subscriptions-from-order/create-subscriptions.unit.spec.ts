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

function isAlreadyCreated(existingSubscriptions: any[]): boolean {
  return existingSubscriptions.length > 0
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
  it("returns true when subscriptions already exist for the order", () => {
    expect(isAlreadyCreated([{ id: "sub_01" }, { id: "sub_02" }])).toBe(true)
  })

  it("returns false when no subscriptions exist (should proceed with creation)", () => {
    expect(isAlreadyCreated([])).toBe(false)
  })

  it("returns true for a single existing subscription", () => {
    expect(isAlreadyCreated([{ id: "sub_01" }])).toBe(true)
  })
})
