import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * GET /promotions?code=XXXX
 *
 * Validates a promotion code and returns its discount percentage.
 * Used by the storefront CartDrawer to preview the discount before checkout.
 * Only returns active, non-expired promotions.
 *
 * Intentionally placed outside /store/* to avoid the mandatory
 * x-publishable-api-key check that Medusa applies to all store routes.
 * CORS is configured in middlewares.ts using STORE_CORS origin.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const code = (req.query.code as string)?.toUpperCase()
  if (!code) {
    return res.status(400).json({ message: "code query param is required" })
  }

  const promotionService = req.scope.resolve(Modules.PROMOTION)

  const promotions = await (promotionService as any).listActivePromotions_(
    { code },
    { relations: ["application_method"] }
  )

  if (!promotions?.length) {
    return res.status(404).json({ message: "Cupón inválido o expirado" })
  }

  const promo = promotions[0]
  const value = promo.application_method?.value ?? 0

  return res.json({
    promotion: {
      id: promo.id,
      code: promo.code,
      status: promo.status,
      discount_value: value,
      type: promo.application_method?.type ?? "percentage",
    },
  })
}
