// src/scripts/fix-mxn-prices.ts
//
// One-time repair: seed-argentina replaced MXN prices with ARS-only prices.
// This script restores MXN prices on all 24 variants while keeping ARS prices.
//
// Run: npx medusa exec ./src/scripts/fix-mxn-prices.ts

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"

// MXN prices in major units (pesos mexicanos, not centavos)
// BASE_PRICE = 750, discounts match the original seed-novapatch.ts
const MXN_PLAN_PRICES: Record<string, number> = {
  once:      750,   // no discount
  monthly:   600,   // 20% off
  bimonthly: 638,   // 15% off — Math.round(750 * 0.85)
  quarterly: 675,   // 10% off
}

// ARS prices to preserve (from seed-argentina.ts)
const ARS_PLAN_PRICES: Record<string, number> = {
  once:      60000,
  monthly:   48000,
  bimonthly: 51000,
  quarterly: 54000,
}

export default async function fixMxnPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productService = container.resolve(Modules.PRODUCT)

  logger.info("[fix-mxn-prices] Starting MXN price repair...")

  const variants = await productService.listProductVariants(
    {},
    { select: ["id", "sku"] }
  )
  logger.info(`[fix-mxn-prices] Found ${variants.length} variants`)

  let updated = 0
  let skipped = 0

  for (const variant of variants) {
    const sku = variant.sku ?? ""
    const plan = sku.split("-").pop()

    if (!plan || !(plan in MXN_PLAN_PRICES)) {
      logger.warn(`[fix-mxn-prices] Unknown plan for SKU "${sku}" — skipping`)
      skipped++
      continue
    }

    try {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: [{
            id: variant.id,
            prices: [
              { currency_code: "mxn", amount: MXN_PLAN_PRICES[plan] },
              { currency_code: "ars", amount: ARS_PLAN_PRICES[plan] },
            ],
          }],
        },
      })
      logger.info(
        `[fix-mxn-prices] ✓ SKU "${sku}" → $${MXN_PLAN_PRICES[plan]} MXN / $${ARS_PLAN_PRICES[plan].toLocaleString()} ARS`
      )
      updated++
    } catch (err) {
      logger.error(
        `[fix-mxn-prices] ✗ SKU "${sku}": ${err instanceof Error ? err.message : String(err)}`
      )
      skipped++
    }
  }

  logger.info(
    `[fix-mxn-prices] Done. Updated: ${updated} | Skipped/Failed: ${skipped}`
  )
}
