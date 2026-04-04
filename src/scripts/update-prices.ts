import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"

// Exact prices in centavos (1 MXN = 100 centavos)
const PLAN_PRICES: Record<string, number> = {
  once:      75000,  // $750 MXN
  quarterly: 67500,  // $675 MXN (10% off)
  bimonthly: 63700,  // $637 MXN (15% off)
  monthly:   60000,  // $600 MXN (20% off)
}

export default async function updatePrices({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const productService = container.resolve(Modules.PRODUCT)

  logger.info("[update-prices] Starting price update...")

  const variants = await productService.listProductVariants(
    {},
    { select: ["id", "sku"] }
  )

  logger.info(`[update-prices] Found ${variants.length} variants`)

  let updated = 0
  let skipped = 0

  for (const variant of variants) {
    const sku = variant.sku ?? ""
    // SKU format: "{product}-{plan}" e.g. "energy-monthly"
    const plan = sku.split("-").pop()

    if (!plan || !(plan in PLAN_PRICES)) {
      logger.warn(`[update-prices] Unknown plan for SKU "${sku}" — skipping`)
      skipped++
      continue
    }

    try {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: [{
            id: variant.id,
            prices: [{ currency_code: "mxn", amount: PLAN_PRICES[plan] }],
          }],
        },
      })
      logger.info(
        `[update-prices] ✓ SKU "${sku}" → $${PLAN_PRICES[plan] / 100} MXN`
      )
      updated++
    } catch (err) {
      logger.error(
        `[update-prices] ✗ SKU "${sku}": ${err instanceof Error ? err.message : String(err)}`
      )
      skipped++
    }
  }

  logger.info(
    `[update-prices] Done. Updated: ${updated} | Skipped/Failed: ${skipped}`
  )
}
