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
        { id: "item_energy", unit_price: 600, original_unit_price: 750 },
        { id: "item_sleep", unit_price: 600, original_unit_price: 750 },
        { id: "item_zen", unit_price: 600, original_unit_price: 750 },
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
        { id: "item_energy", unit_price: 637.5, original_unit_price: 750 },
        { id: "item_sleep", unit_price: 637.5, original_unit_price: 750 },
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
        { id: "item_energy", unit_price: 600, original_unit_price: 750 },
        { id: "item_sleep", unit_price: 600, original_unit_price: 750 },
        { id: "item_zen", unit_price: 600, original_unit_price: 750 },
      ])
    })
  })

  describe("idempotency & price-manipulation safety", () => {
    // Simulates the second call: line items already carry the discounted
    // unit_price plus the original anchor in metadata.
    const alreadyAdjustedTrio = [
      { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 600, metadata: { original_unit_price: 750, bundle_adjusted: true } },
      { id: "item_sleep", variant: { product: { handle: "sleep" } }, quantity: 1, unit_price: 600, metadata: { original_unit_price: 750, bundle_adjusted: true } },
      { id: "item_zen", variant: { product: { handle: "zen" } }, quantity: 1, unit_price: 600, metadata: { original_unit_price: 750, bundle_adjusted: true } },
    ]

    it("is idempotent: a second call on already-adjusted items produces no updates", () => {
      const { updates } = computeBundleItemPriceUpdates(alreadyAdjustedTrio)
      expect(updates).toEqual([])
    })

    it("does NOT stack discounts across repeated calls", () => {
      // Run three times; the price must never drop below the single legit 600.
      let items = [
        { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 750, metadata: {} as any },
        { id: "item_sleep", variant: { product: { handle: "sleep" } }, quantity: 1, unit_price: 750, metadata: {} as any },
        { id: "item_zen", variant: { product: { handle: "zen" } }, quantity: 1, unit_price: 750, metadata: {} as any },
      ]
      for (let i = 0; i < 3; i++) {
        const { updates } = computeBundleItemPriceUpdates(items)
        // Apply updates the way the route does (unit_price + metadata anchor).
        items = items.map((item) => {
          const u = updates.find((x) => x.id === item.id)
          return u
            ? { ...item, unit_price: u.unit_price, metadata: { ...item.metadata, original_unit_price: u.original_unit_price, bundle_adjusted: true } }
            : item
        })
      }
      expect(items.map((i) => i.unit_price)).toEqual([600, 600, 600])
    })

    it("ignores a forged metadata.original_unit_price lower than the current price", () => {
      // Attacker adds an item with a crafted low anchor hoping to be charged ~0.
      const items = [
        { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 750, metadata: { original_unit_price: 0 } },
        { id: "item_sleep", variant: { product: { handle: "sleep" } }, quantity: 1, unit_price: 750, metadata: { original_unit_price: 0 } },
      ]
      const { updates } = computeBundleItemPriceUpdates(items)
      // Anchor falls back to the authoritative 750, so price is 637.5 — never 0.
      expect(updates).toEqual([
        { id: "item_energy", unit_price: 637.5, original_unit_price: 750 },
        { id: "item_sleep", unit_price: 637.5, original_unit_price: 750 },
      ])
    })

    it("restores price toward the original when an item no longer qualifies for a bundle", () => {
      // Duo was adjusted to 637.5 each; the sleep item was removed, so energy
      // alone no longer qualifies and should go back to 750.
      const items = [
        { id: "item_energy", variant: { product: { handle: "energy" } }, quantity: 1, unit_price: 637.5, metadata: { original_unit_price: 750, bundle_adjusted: true } },
      ]
      const { updates } = computeBundleItemPriceUpdates(items)
      expect(updates).toEqual([{ id: "item_energy", unit_price: 750, original_unit_price: 750 }])
    })
  })
})
