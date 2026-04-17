import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /shipping-options
 *
 * Returns available shipping options with their prices.
 * Placed outside /store/* to avoid the mandatory x-publishable-api-key check.
 * Used by the storefront CartDrawer (preview) and checkout flow.
 * CORS configured in middlewares.ts via STORE_CORS.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "price_type",
      "prices.amount",
      "prices.currency_code",
    ],
  })

  const result = options.map((opt: any) => {
    const mxnPrice = opt.prices?.find(
      (p: any) => p.currency_code === "mxn"
    )
    return {
      id: opt.id,
      name: opt.name,
      price_type: opt.price_type,
      amount: mxnPrice?.amount ?? 0,
      currency_code: "mxn",
    }
  })

  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
  return res.json({ shipping_options: result })
}
