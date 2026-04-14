// src/scripts/seed-argentina.ts
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  updateStoresWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"

// ARS prices in major units (pesos argentinos, not centavos)
// Base price: $60,000 ARS — discounts match MX tiers (20/15/10%)
const ARS_PLAN_PRICES: Record<string, number> = {
  once:      60000,
  monthly:   48000,  // 20% off
  bimonthly: 51000,  // 15% off
  quarterly: 54000,  // 10% off
}

export default async function seedArgentina({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storeService = container.resolve(Modules.STORE)
  const regionService = container.resolve(Modules.REGION)
  const productService = container.resolve(Modules.PRODUCT)

  logger.info("[seed-argentina] Starting Argentina seed...")

  // 1. Add ARS to supported currencies (idempotent)
  logger.info("[seed-argentina] Updating store supported currencies...")
  const [store] = await storeService.listStores()
  const existingCurrencies = store.supported_currencies ?? []
  // Medusa's supported_currencies returns a mixed DTO type — any is pragmatic here
  const hasArs = existingCurrencies.some((c: any) => c.currency_code === "ars")

  if (!hasArs) {
    // listStores() doesn't populate supported_currencies with is_default reliably.
    // Hardcode the full list: MXN stays default, add ARS.
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            { currency_code: "mxn", is_default: true },
            { currency_code: "ars", is_default: false },
          ],
        },
      },
    })
    logger.info("[seed-argentina] ARS added to supported currencies")
  } else {
    logger.info("[seed-argentina] ARS already present — skipping currency update")
  }

  // 2. Create Argentina region (idempotent)
  const existingRegions = await regionService.listRegions({ name: "Argentina" })

  if (!existingRegions.length) {
    logger.info("[seed-argentina] Creating Argentina region...")
    try {
      const { result } = await createRegionsWorkflow(container).run({
        input: {
          regions: [{
            name: "Argentina",
            currency_code: "ars",
            countries: ["ar"],
            payment_providers: ["pp_system_default"],
          }],
        },
      })
      logger.info(`[seed-argentina] Argentina region created: ${result[0].id}`)
    } catch {
      logger.warn("[seed-argentina] Region creation with payment provider failed, retrying without...")
      const { result } = await createRegionsWorkflow(container).run({
        input: {
          regions: [{
            name: "Argentina",
            currency_code: "ars",
            countries: ["ar"],
          }],
        },
      })
      logger.info(`[seed-argentina] Argentina region created (no payment provider): ${result[0].id}`)
    }
  } else {
    logger.info(`[seed-argentina] Argentina region already exists: ${existingRegions[0].id} — skipping`)
  }

  // 3. Add ARS prices to all 24 variants
  logger.info("[seed-argentina] Fetching variants...")
  const variants = await productService.listProductVariants(
    {},
    { select: ["id", "sku"] }
  )
  logger.info(`[seed-argentina] Found ${variants.length} variants`)

  let updated = 0
  let skipped = 0

  for (const variant of variants) {
    const sku = variant.sku ?? ""
    // SKU format: "{product}-{plan}" e.g. "energy-monthly"
    const plan = sku.split("-").pop()

    if (!plan || !(plan in ARS_PLAN_PRICES)) {
      logger.warn(`[seed-argentina] Unknown plan for SKU "${sku}" — skipping`)
      skipped++
      continue
    }

    try {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: [{
            id: variant.id,
            prices: [{ currency_code: "ars", amount: ARS_PLAN_PRICES[plan] }],
          }],
        },
      })
      logger.info(`[seed-argentina] ✓ SKU "${sku}" → $${ARS_PLAN_PRICES[plan].toLocaleString()} ARS`)
      updated++
    } catch (err) {
      logger.error(
        `[seed-argentina] ✗ SKU "${sku}": ${err instanceof Error ? err.message : String(err)}`
      )
      skipped++
    }
  }

  logger.info(
    `[seed-argentina] Done. Updated: ${updated} | Skipped/Failed: ${skipped}`
  )
}
