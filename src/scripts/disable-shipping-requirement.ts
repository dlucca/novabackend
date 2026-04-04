/**
 * disable-shipping-requirement.ts
 *
 * Sets requires_shipping=false on all product variants so Medusa
 * skips the shipping-profile validation on cart completion.
 * Novapatch handles fulfillment externally.
 *
 * Run: npx medusa exec ./src/scripts/disable-shipping-requirement.ts
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function disableShippingRequirement({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // Use raw DB connection to do a simple bulk UPDATE
  const pgConnection = container.resolve("__pg_connection__") as any

  try {
    const result = await pgConnection.raw(
      `UPDATE "product_variant" SET "requires_shipping" = false WHERE "requires_shipping" = true`
    )
    const count = result.rowCount ?? result[0]?.rowCount ?? "?"
    logger.info(`Updated ${count} variants to requires_shipping=false.`)
  } catch (e) {
    // Fallback: try knex-style
    logger.warn(`pg_connection failed: ${(e as Error).message}. Trying manager...`)
    const manager = container.resolve("manager") as any
    const result = await manager.query(
      `UPDATE "product_variant" SET "requires_shipping" = false`
    )
    logger.info(`Updated variants via manager. Result: ${JSON.stringify(result)}`)
  }

  logger.info("Done.")
}
