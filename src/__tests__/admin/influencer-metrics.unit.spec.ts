import { computeRevenue } from "../../../src/admin/routes/influencers/lib/metrics"

type OrderStub = { total: number; currency_code: string }

describe("computeRevenue", () => {
  it("returns 0 for empty order list", () => {
    expect(computeRevenue([])).toBe(0)
  })

  it("sums totals from multiple orders", () => {
    const orders: OrderStub[] = [
      { total: 50000, currency_code: "mxn" },
      { total: 30000, currency_code: "mxn" },
    ]
    expect(computeRevenue(orders)).toBe(80000)
  })

  it("handles a single order", () => {
    expect(computeRevenue([{ total: 12345, currency_code: "mxn" }])).toBe(12345)
  })
})
