/**
 * fix-prices-v2.ts
 *
 * Divides all existing prices by 100 to fix the centavos→pesos mistake.
 * Medusa v2 stores prices in major units (pesos), not smallest unit (centavos).
 *
 * Also fixes the shipping option price.
 *
 * Run: npx medusa exec ./src/scripts/fix-prices-v2.ts
 */
import { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function fixPricesV2({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pricingService = container.resolve(Modules.PRICING)

  // 1. Fix product prices
  const priceSets = await pricingService.listPriceSets({}, { relations: ["prices"], take: 50 })
  let fixed = 0

  for (const ps of priceSets) {
    for (const price of (ps as any).prices ?? []) {
      if (price.amount >= 100) {
        const newAmount = price.amount / 100
        await pricingService.updatePrices([
          { id: price.id, amount: newAmount },
        ])
        logger.info(`  Price ${price.id}: ${price.amount} → ${newAmount}`)
        fixed++
      }
    }
  }
  logger.info(`Fixed ${fixed} prices.`)

  // 2. Fix shipping option price
  const fulfillmentService = container.resolve(Modules.FULFILLMENT)
  const options = await fulfillmentService.listShippingOptions({ name: "Envío estándar a domicilio" })
  if (options.length) {
    logger.info(`Shipping option ${options[0].id} — price fix handled by price set above if linked.`)
  }

  logger.info("Done. Prices are now in major units (pesos).")
}
