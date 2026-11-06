import { computeBundleDiscount, computeBundleItemPriceUpdates } from "../../lib/bundle-pricing"

describe("Bundle pricing & line item adjustments", () => {
  describe("computeBundleDiscount", () => {
    it("computes $450 discount for Pack Trío Vitalidad (energy + sleep + zen)", () => {
      const items = [
        { handle: "energy", quantity: 1, isSubscription: false },
        { handle: "sleep", quantity: 1, isSubscription: false },
        { handle: "zen", quantity: 1, isSubscription: false },
      ]
      expect(computeBundleDiscount(items)).toBe(450)
    })

    it("computes $225 discount for Pack Día & Noche (energy + sleep)", () => {
      const items = [
        { handle: "energy", quantity: 1, isSubscription: false },
        { handle: "sleep", quantity: 1, isSubscription: false },
      ]
      expect(computeBundleDiscount(items)).toBe(225)
    })

    it("computes $225 discount for Pack Calma & Sueño (zen + sleep)", () => {
      const items = [
        { handle: "zen", quantity: 1, isSubscription: false },
        { handle: "sleep", quantity: 1, isSubscription: false },
      ]
      expect(computeBundleDiscount(items)).toBe(225)
    })

    it("computes $225 discount for Pack Glow & Balance (glow + woman)", () => {
      const items = [
        { handle: "glow", quantity: 1, isSubscription: false },
        { handle: "woman", quantity: 1, isSubscription: false },
      ]
      expect(computeBundleDiscount(items)).toBe(225)
    })

    it("ignores subscription items when calculating once bundle discounts", () => {
      const items = [
        { handle: "energy", quantity: 1, isSubscription: true },
        { handle: "sleep", quantity: 1, isSubscription: false },
        { handle: "zen", quantity: 1, isSubscription: false },
      ]
      // Only sleep + zen are once -> triggers Calma & Sueño ($225), not Trío ($450)
      expect(computeBundleDiscount(items)).toBe(225)
    })

    it("handles multiple quantities (2 Trios)", () => {
      const items = [
        { handle: "energy", quantity: 2, isSubscription: false },
        { handle: "sleep", quantity: 2, isSubscription: false },
        { handle: "zen", quantity: 2, isSubscription: false },
      ]
      expect(computeBundleDiscount(items)).toBe(900)
    })
  })

  describe("computeBundleItemPriceUpdates", () => {
    it("updates line item prices for Trío Vitalidad from 750 to 600 each", () => {
      const items = [
        { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 750, metadata: {} },
        { id: "item_sleep", variant: { product: { handle: "sleep" } }, quantity: 1, unit_price: 750, metadata: {} },
        { id: "item_zen", variant: { product: { handle: "zen" } }, quantity: 1, unit_price: 750, metadata: {} },
      ]

      const { updates, totalDiscount } = computeBundleItemPriceUpdates(items)

      expect(totalDiscount).toBe(450)
      expect(updates).toEqual([
        { id: "item_energy", unit_price: 600 },
        { id: "item_sleep", unit_price: 600 },
        { id: "item_zen", unit_price: 600 },
      ])

      // Total of updated items = 600 + 600 + 600 = 1800
      const newTotal = updates.reduce((sum, u) => sum + u.unit_price, 0)
      expect(newTotal).toBe(1800)
    })

    it("updates line item prices for Duo (Día & Noche) from 750 to 637.5 each", () => {
      const items = [
        { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 750, metadata: {} },
        { id: "item_sleep", variant: { product: { handle: "sleep" } }, quantity: 1, unit_price: 750, metadata: {} },
      ]

      const { updates, totalDiscount } = computeBundleItemPriceUpdates(items)

      expect(totalDiscount).toBe(225)
      expect(updates).toEqual([
        { id: "item_energy", unit_price: 637.5 },
        { id: "item_sleep", unit_price: 637.5 },
      ])

      // Total of updated items = 637.5 + 637.5 = 1275
      const newTotal = updates.reduce((sum, u) => sum + u.unit_price, 0)
      expect(newTotal).toBe(1275)
    })

    it("does not update single items that are not part of any bundle", () => {
      const items = [
        { id: "item_shield", variant: { product: { handle: "shield" } }, quantity: 1, unit_price: 750, metadata: {} },
      ]

      const { updates, totalDiscount } = computeBundleItemPriceUpdates(items)

      expect(totalDiscount).toBe(0)
      expect(updates).toEqual([])
    })

    it("handles mixed cart: Trío Vitalidad + 1 single Shield", () => {
      const items = [
        { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 750, metadata: {} },
        { id: "item_sleep", variant: { product: { handle: "sleep" } }, quantity: 1, unit_price: 750, metadata: {} },
        { id: "item_zen", variant: { product: { handle: "zen" } }, quantity: 1, unit_price: 750, metadata: {} },
        { id: "item_shield", variant: { product: { handle: "shield" } }, quantity: 1, unit_price: 750, metadata: {} },
      ]

      const { updates, totalDiscount } = computeBundleItemPriceUpdates(items)

      expect(totalDiscount).toBe(450)
      expect(updates).toEqual([
        { id: "item_energy", unit_price: 600 },
        { id: "item_sleep", unit_price: 600 },
        { id: "item_zen", unit_price: 600 },
      ])
    })
  })
})
