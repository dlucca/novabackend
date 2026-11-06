/**
 * src/lib/bundle-pricing.ts — Server-side bundle discount & line item price adjustment logic
 *
 * Mirrors the logic in apps/storefront/lib/cart.ts → cartTotals().
 * Only "once" (non-subscription) items qualify for bundle discounts.
 * Subscription items get their discount via variant metadata (discount_percentage),
 * not via bundle logic.
 *
 * Bundle rules (greedy, evaluated in priority order):
 *   Pack Trío Vitalidad  = energy + sleep + zen  → $450 OFF per set ($150 off each)
 *   Pack Día & Noche     = energy + sleep          → $225 OFF per set ($112.50 off each)
 *   Pack Calma & Sueño   = zen   + sleep          → $225 OFF per set ($112.50 off each)
 *   Pack Glow & Balance  = glow  + woman           → $225 OFF per set ($112.50 off each)
 */

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
 * Computes total bundle discount amount from line items.
 */
export function computeBundleDiscount(
  items: Array<{ handle: string; quantity: number; isSubscription: boolean }>
): number {
  const qtyMap: Record<string, number> = {}
  for (const item of items) {
    if (!item.isSubscription) {
      qtyMap[item.handle] = (qtyMap[item.handle] ?? 0) + item.quantity
    }
  }

  let bundleDiscount = 0

  const trioCount = Math.min(qtyMap["energy"] ?? 0, qtyMap["sleep"] ?? 0, qtyMap["zen"] ?? 0)
  if (trioCount > 0) {
    bundleDiscount += trioCount * 450
    qtyMap["energy"] -= trioCount
    qtyMap["sleep"] -= trioCount
    qtyMap["zen"] -= trioCount
  }

  const diaNocheCount = Math.min(qtyMap["energy"] ?? 0, qtyMap["sleep"] ?? 0)
  if (diaNocheCount > 0) {
    bundleDiscount += diaNocheCount * 225
    qtyMap["energy"] -= diaNocheCount
    qtyMap["sleep"] -= diaNocheCount
  }

  const calmaSuenoCount = Math.min(qtyMap["zen"] ?? 0, qtyMap["sleep"] ?? 0)
  if (calmaSuenoCount > 0) {
    bundleDiscount += calmaSuenoCount * 225
    qtyMap["zen"] -= calmaSuenoCount
    qtyMap["sleep"] -= calmaSuenoCount
  }

  const glowBalanceCount = Math.min(qtyMap["glow"] ?? 0, qtyMap["woman"] ?? 0)
  if (glowBalanceCount > 0) {
    bundleDiscount += glowBalanceCount * 225
    qtyMap["glow"] -= glowBalanceCount
    qtyMap["woman"] -= glowBalanceCount
  }

  return bundleDiscount
}

/**
 * Computes unit_price updates for cart line items so that Medusa's Cart / Order
 * natively reflects the discounted bundle price.
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
      typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price ?? 750))
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
  // catalog price, never from an already-discounted value.
  const units: Array<{ id: string; handle: string; originalPrice: number; discountedPrice: number }> = []
  for (const item of onceItems) {
    for (let q = 0; q < item.quantity; q++) {
      units.push({
        id: item.id,
        handle: item.handle,
        originalPrice: item.originalPrice,
        discountedPrice: item.originalPrice,
      })
    }
  }

  let totalDiscount = 0

  // 1. Pack Trío Vitalidad (energy + sleep + zen) -> $450 OFF ($150 off each)
  while (true) {
    const energyUnit = units.find((u) => u.handle === "energy" && u.discountedPrice === u.originalPrice)
    const sleepUnit = units.find((u) => u.handle === "sleep" && u.discountedPrice === u.originalPrice)
    const zenUnit = units.find((u) => u.handle === "zen" && u.discountedPrice === u.originalPrice)

    if (energyUnit && sleepUnit && zenUnit) {
      energyUnit.discountedPrice = Math.max(0, energyUnit.originalPrice - 150)
      sleepUnit.discountedPrice = Math.max(0, sleepUnit.originalPrice - 150)
      zenUnit.discountedPrice = Math.max(0, zenUnit.originalPrice - 150)
      totalDiscount += 450
    } else {
      break
    }
  }

  // 2. Pack Día & Noche (energy + sleep) -> $225 OFF ($112.50 off each)
  while (true) {
    const energyUnit = units.find((u) => u.handle === "energy" && u.discountedPrice === u.originalPrice)
    const sleepUnit = units.find((u) => u.handle === "sleep" && u.discountedPrice === u.originalPrice)

    if (energyUnit && sleepUnit) {
      energyUnit.discountedPrice = Math.max(0, energyUnit.originalPrice - 112.5)
      sleepUnit.discountedPrice = Math.max(0, sleepUnit.originalPrice - 112.5)
      totalDiscount += 225
    } else {
      break
    }
  }

  // 3. Pack Calma & Sueño (zen + sleep) -> $225 OFF ($112.50 off each)
  while (true) {
    const zenUnit = units.find((u) => u.handle === "zen" && u.discountedPrice === u.originalPrice)
    const sleepUnit = units.find((u) => u.handle === "sleep" && u.discountedPrice === u.originalPrice)

    if (zenUnit && sleepUnit) {
      zenUnit.discountedPrice = Math.max(0, zenUnit.originalPrice - 112.5)
      sleepUnit.discountedPrice = Math.max(0, sleepUnit.originalPrice - 112.5)
      totalDiscount += 225
    } else {
      break
    }
  }

  // 4. Pack Glow & Balance (glow + woman) -> $225 OFF ($112.50 off each)
  while (true) {
    const glowUnit = units.find((u) => u.handle === "glow" && u.discountedPrice === u.originalPrice)
    const womanUnit = units.find((u) => u.handle === "woman" && u.discountedPrice === u.originalPrice)

    if (glowUnit && womanUnit) {
      glowUnit.discountedPrice = Math.max(0, glowUnit.originalPrice - 112.5)
      womanUnit.discountedPrice = Math.max(0, womanUnit.originalPrice - 112.5)
      totalDiscount += 225
    } else {
      break
    }
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

  return { updates, totalDiscount }
}
