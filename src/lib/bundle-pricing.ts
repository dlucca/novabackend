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
  // Normalize items
  const parsedItems = items.map((item) => ({
    id: item.id as string,
    handle: (item.variant?.product?.handle ?? item.handle ?? "") as string,
    quantity: (item.quantity ?? 1) as number,
    unit_price: typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price ?? 750)),
    isSubscription: !!(item.metadata?.is_subscription ?? item.variant?.metadata?.is_subscription ?? item.isSubscription),
  }))

  const onceItems = parsedItems.filter((i) => !i.isSubscription && i.id)

  // Expand items into single units for granular discount assignment
  const units: Array<{ id: string; handle: string; originalPrice: number; discountedPrice: number }> = []
  for (const item of onceItems) {
    for (let q = 0; q < item.quantity; q++) {
      units.push({
        id: item.id,
        handle: item.handle,
        originalPrice: item.unit_price,
        discountedPrice: item.unit_price,
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

  // Group back by line item id to calculate average unit_price
  const updates: BundlePriceAdjustment[] = []
  for (const item of onceItems) {
    const matchingUnits = units.filter((u) => u.id === item.id)
    if (matchingUnits.length > 0) {
      const avgUnitPrice =
        matchingUnits.reduce((sum, u) => sum + u.discountedPrice, 0) / matchingUnits.length
      if (Math.abs(avgUnitPrice - item.unit_price) > 0.001) {
        updates.push({
          id: item.id,
          unit_price: avgUnitPrice,
        })
      }
    }
  }

  return { updates, totalDiscount }
}
