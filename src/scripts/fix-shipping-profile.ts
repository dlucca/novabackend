/**
 * fix-shipping-profile.ts
 *
 * Updates the shipping option to use the "Default Shipping Profile"
 * that Medusa auto-created and assigned to all products.
 *
 * Run: npx medusa exec ./src/scripts/fix-shipping-profile.ts
 */
import { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function fixShippingProfile({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentService = container.resolve(Modules.FULFILLMENT)

  // Find the auto-created Medusa shipping profile (type=default, NOT created by us)
  const profiles = await fulfillmentService.listShippingProfiles({ type: "default" })
  logger.info(`Found ${profiles.length} default profile(s):`)
  for (const p of profiles) {
    logger.info(`  ${p.id} - "${p.name}"`)
  }

  // The oldest one is the auto-created Medusa profile (products use it)
  const medusaProfile = profiles.sort((a, b) =>
    new Date(a.created_at as unknown as string).getTime() - new Date(b.created_at as unknown as string).getTime()
  )[0]

  logger.info(`Using profile: ${medusaProfile.id} - "${medusaProfile.name}"`)

  // Find our shipping option
  const options = await fulfillmentService.listShippingOptions({ name: "Envío estándar a domicilio" })
  if (!options.length) {
    logger.error("Shipping option not found. Run setup-shipping.ts first.")
    return
  }
  const option = options[0]
  logger.info(`Shipping option ${option.id} currently uses profile: ${option.shipping_profile_id}`)

  if (option.shipping_profile_id === medusaProfile.id) {
    logger.info("Already using the correct profile. Nothing to do.")
    return
  }

  await fulfillmentService.updateShippingOptions(
    { id: option.id },
    { shipping_profile_id: medusaProfile.id }
  )
  logger.info(`✓ Shipping option updated to profile: ${medusaProfile.id}`)
  logger.info("Done! Cart completion should work now.")
}
