import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function diagnose({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const productService = container.resolve(Modules.PRODUCT)
  const pricingService = container.resolve(Modules.PRICING)

  const variants = await productService.listProductVariants(
    {},
    { select: ["id", "sku"], take: 8 }
  )

  logger.info(`=== FOUND ${variants.length} VARIANTS ===`)

  // List all price sets
  const allPriceSets = await pricingService.listPriceSets(
    {},
    { relations: ["prices"], take: 30 }
  )

  logger.info(`=== TOTAL PRICE SETS IN DB: ${allPriceSets.length} ===`)

  for (const ps of allPriceSets.slice(0, 5)) {
    logger.info(`  PriceSet ${ps.id} → prices: ${JSON.stringify((ps as any).prices?.map((p: any) => ({ amount: p.amount, currency: p.currency_code })))}`)
  }

  logger.info("=== VARIANT SKUs ===")
  for (const v of variants) {
    logger.info(`  id=${v.id}  sku=${v.sku}`)
  }
}
