type OrderWithTotal = { total: number; currency_code: string }

/**
 * Sums order totals (in smallest currency unit, e.g. centavos).
 * All orders are assumed to be in the same currency.
 */
export function computeRevenue(orders: OrderWithTotal[]): number {
  return orders.reduce((sum, o) => sum + (o.total ?? 0), 0)
}
