// src/api/admin/customers/[id]/subscriptions/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { data: customers } = await query.graph({
      entity: "customer",
      filters: { id: customerId },
      fields: [
        "id",
        "subscriptions.*",
        "subscriptions.subscription_orders.*",
        "subscriptions.subscription_orders.order.total",
        "subscriptions.subscription_orders.order.currency_code",
        "subscriptions.product_variant.id",
        "subscriptions.product_variant.title",
        "subscriptions.product_variant.product.title",
      ],
    })

    const customer = customers?.[0] as any
    const rawSubscriptions = customer?.subscriptions ?? []

    const subscriptions = rawSubscriptions.map((s: any) => {
      const orders: any[] = s.subscription_orders ?? []
      const cycles_count = orders.length
      const total_charged = orders.reduce(
        (sum: number, so: any) => sum + (so.order?.total ?? 0),
        0
      )
      const currencies = new Set(
        orders.map((so: any) => so.order?.currency_code).filter(Boolean)
      )
      const currency_code =
        currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? "MXN" : "MIXED"

      return {
        id: s.id,
        status: s.status,
        interval_days: s.interval_days,
        next_billing_date: s.next_billing_date,
        variant: {
          id: s.product_variant?.id ?? null,
          title: s.product_variant?.title ?? null,
          product: {
            title: s.product_variant?.product?.title ?? null,
          },
        },
        cycles_count,
        total_charged,
        currency_code,
      }
    })

    res.json({ subscriptions })
  } catch (err) {
    const logger = req.scope.resolve("logger")
    logger.error(
      `[admin/customers/:id/subscriptions] Error for customer ${customerId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    res.status(500).json({ message: "Failed to fetch subscriptions" })
  }
}
