/**
 * src/lib/bundle-pricing.ts — Server-side bundle discount & line item price adjustment logic
 *
 * Mirrors the logic in apps/storefront/lib/cart.ts → cartTotals().
 * Only "once" (non-subscription) items qualify for bundle discounts.
 * Subscription items get their discount via variant metadata (discount_percentage),
 * not via bundle logic.
 *
 * Discounts are PERCENTAGES, not flat amounts, so they work in any region/currency.
 * They are applied to each line item's own catalog unit_price (which Medusa already
 * resolves per region), so MXN carts and ARS carts both get the correct discount.
 *
 * Bundle rules (greedy, evaluated in priority order):
 *   Pack Trío Vitalidad  = energy + sleep + zen  → 20% OFF each unit
 *   Pack Día & Noche     = energy + sleep          → 15% OFF each unit
 *   Pack Calma & Sueño   = zen   + sleep          → 15% OFF each unit
 *   Pack Glow & Balance  = glow  + woman           → 15% OFF each unit
 *
 * (At the MXN base of $750/unit these resolve to the previous flat amounts:
 *  trío $150 off/unit, dúo $112.50 off/unit.)
 */

/** Trío Vitalidad: 20% off each unit. */
export const TRIO_DISCOUNT_PCT = 0.2
/** Any dúo pack: 15% off each unit. */
export const DUO_DISCOUNT_PCT = 0.15

/** Rounds to 2 decimals to avoid floating-point drift on prices in major units. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface LineItemInput {
  id?: string
  handle: string
  quantity: number
  unit_price: number | string
  isSubscription: boolean
}

export interface BundlePriceAdjustment {
  id: string
  unit_price: number
  /**
   * The authoritative (pre-discount) price this adjustment was computed from.
   * Persisted to the line item's metadata so repeated calls recompute from the
   * same anchor instead of stacking discounts on an already-discounted price.
   */
  original_unit_price: number
}

/**
 * Resolves the authoritative pre-discount price for a line item.
 *
 * The client cannot set unit_price (Medusa derives it from the catalog), so a
 * never-adjusted item's current unit_price IS the catalog price. Once we adjust
 * it, we stash the original in metadata.original_unit_price and read it back
 * here. We only trust that stored value when it is >= the current price:
 * bundle discounts only ever LOWER a price, so a stored original below the
 * current price can only be a forged/client-supplied value and is ignored.
 * This keeps the computation idempotent and prevents a crafted metadata payload
 * from driving the charged price below the real catalog price.
 */
function resolveOriginalPrice(currentPrice: number, metadata: any): number {
  const stored = metadata?.original_unit_price
  const storedNum = typeof stored === "number" ? stored : parseFloat(String(stored ?? ""))
  if (Number.isFinite(storedNum) && storedNum >= currentPrice) {
    return storedNum
  }
  return currentPrice
}

/**
 * Computes total bundle discount amount from line items, using each unit's own
 * price and the percentage rules. Region-agnostic: pass the items' catalog
 * unit_price and the result is in that same currency.
 */
export function computeBundleDiscount(
  items: Array<{ handle: string; quantity: number; unit_price?: number | string; isSubscription: boolean }>
): number {
  // Expand once-items into single units carrying their own price, so a greedy
  // match can compute the per-unit percentage discount from the real price.
  const units: Array<{ handle: string; price: number; bundled: boolean }> = []
  for (const item of items) {
    if (item.isSubscription) continue
    const price =
      typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price ?? 0))
    for (let q = 0; q < item.quantity; q++) {
      units.push({ handle: item.handle, price: Number.isFinite(price) ? price : 0, bundled: false })
    }
  }

  const take = (handle: string) => units.find((u) => u.handle === handle && !u.bundled)

  let bundleDiscount = 0

  // 1. Trío Vitalidad (energy + sleep + zen) — 20% off each
  while (true) {
    const e = take("energy")
    const s = take("sleep")
    const z = take("zen")
    if (e && s && z) {
      for (const u of [e, s, z]) {
        bundleDiscount += u.price * TRIO_DISCOUNT_PCT
        u.bundled = true
      }
    } else break
  }

  // 2. Día & Noche (energy + sleep) — 15% off each
  while (true) {
    const e = take("energy")
    const s = take("sleep")
    if (e && s) {
      for (const u of [e, s]) {
        bundleDiscount += u.price * DUO_DISCOUNT_PCT
        u.bundled = true
      }
    } else break
  }

  // 3. Calma & Sueño (zen + sleep) — 15% off each
  while (true) {
    const z = take("zen")
    const s = take("sleep")
    if (z && s) {
      for (const u of [z, s]) {
        bundleDiscount += u.price * DUO_DISCOUNT_PCT
        u.bundled = true
      }
    } else break
  }

  // 4. Glow & Balance (glow + woman) — 15% off each
  while (true) {
    const g = take("glow")
    const w = take("woman")
    if (g && w) {
      for (const u of [g, w]) {
        bundleDiscount += u.price * DUO_DISCOUNT_PCT
        u.bundled = true
      }
    } else break
  }

  return round2(bundleDiscount)
}

/**
 * Computes unit_price updates for cart line items so that Medusa's Cart / Order
 * natively reflects the discounted bundle price. Discounts are percentages of
 * each item's own catalog price, so this is correct in every region/currency.
 */
export function computeBundleItemPriceUpdates(
  items: any[]
): { updates: BundlePriceAdjustment[]; totalDiscount: number } {
  // Normalize items. `currentPrice` is the line item's live unit_price (which
  // may already be discounted from a previous call); `originalPrice` is the
  // authoritative anchor we compute discounts from, so repeated calls are
  // idempotent instead of stacking discounts.
  const parsedItems = items.map((item) => {
    const currentPrice =
      typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price ?? 0))
    return {
      id: item.id as string,
      handle: (item.variant?.product?.handle ?? item.handle ?? "") as string,
      quantity: (item.quantity ?? 1) as number,
      currentPrice,
      originalPrice: resolveOriginalPrice(currentPrice, item.metadata),
      isSubscription: !!(item.metadata?.is_subscription ?? item.variant?.metadata?.is_subscription ?? item.isSubscription),
    }
  })

  const onceItems = parsedItems.filter((i) => !i.isSubscription && i.id)

  // Expand items into single units for granular discount assignment. Units are
  // anchored to originalPrice so the greedy passes always start from the real
  // catalog price, never from an already-discounted value. `bundled` marks a
  // unit as already consumed by a pack.
  const units: Array<{ id: string; handle: string; originalPrice: number; discountedPrice: number; bundled: boolean }> = []
  for (const item of onceItems) {
    for (let q = 0; q < item.quantity; q++) {
      units.push({
        id: item.id,
        handle: item.handle,
        originalPrice: item.originalPrice,
        discountedPrice: item.originalPrice,
        bundled: false,
      })
    }
  }

  const take = (handle: string) => units.find((u) => u.handle === handle && !u.bundled)

  let totalDiscount = 0

  const applyDiscount = (unit: { originalPrice: number; discountedPrice: number; bundled: boolean }, pct: number) => {
    unit.discountedPrice = round2(Math.max(0, unit.originalPrice * (1 - pct)))
    unit.bundled = true
    totalDiscount += round2(unit.originalPrice - unit.discountedPrice)
  }

  // 1. Pack Trío Vitalidad (energy + sleep + zen) -> 20% OFF each
  while (true) {
    const e = take("energy")
    const s = take("sleep")
    const z = take("zen")
    if (e && s && z) {
      applyDiscount(e, TRIO_DISCOUNT_PCT)
      applyDiscount(s, TRIO_DISCOUNT_PCT)
      applyDiscount(z, TRIO_DISCOUNT_PCT)
    } else break
  }

  // 2. Pack Día & Noche (energy + sleep) -> 15% OFF each
  while (true) {
    const e = take("energy")
    const s = take("sleep")
    if (e && s) {
      applyDiscount(e, DUO_DISCOUNT_PCT)
      applyDiscount(s, DUO_DISCOUNT_PCT)
    } else break
  }

  // 3. Pack Calma & Sueño (zen + sleep) -> 15% OFF each
  while (true) {
    const z = take("zen")
    const s = take("sleep")
    if (z && s) {
      applyDiscount(z, DUO_DISCOUNT_PCT)
      applyDiscount(s, DUO_DISCOUNT_PCT)
    } else break
  }

  // 4. Pack Glow & Balance (glow + woman) -> 15% OFF each
  while (true) {
    const g = take("glow")
    const w = take("woman")
    if (g && w) {
      applyDiscount(g, DUO_DISCOUNT_PCT)
      applyDiscount(w, DUO_DISCOUNT_PCT)
    } else break
  }

  // Group back by line item id to calculate average unit_price. We clamp the
  // result to the anchor price and only emit an update when the target differs
  // from the line item's CURRENT price — so an already-correct item produces no
  // write (idempotent), and an item that no longer qualifies for a bundle is
  // restored toward its original price.
  const updates: BundlePriceAdjustment[] = []
  for (const item of onceItems) {
    const matchingUnits = units.filter((u) => u.id === item.id)
    if (matchingUnits.length > 0) {
      const rawAvg =
        matchingUnits.reduce((sum, u) => sum + u.discountedPrice, 0) / matchingUnits.length
      const avgUnitPrice = Math.min(Math.max(0, rawAvg), item.originalPrice)
      if (Math.abs(avgUnitPrice - item.currentPrice) > 0.001) {
        updates.push({
          id: item.id,
          unit_price: avgUnitPrice,
          original_unit_price: item.originalPrice,
        })
      }
    }
  }

  return { updates, totalDiscount: round2(totalDiscount) }
}
