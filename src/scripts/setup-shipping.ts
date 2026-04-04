/**
 * setup-shipping.ts
 *
 * Creates the shipping infrastructure for Novapatch:
 *   1. FulfillmentSet linked to the existing stock location
 *   2. ServiceZone covering Mexico
 *   3. ShippingProfile (default)
 *   4. ShippingOption: Envío estándar a domicilio — $85 MXN flat
 *
 * Run once in production:
 *   npx medusa exec ./src/scripts/setup-shipping.ts
 *
 * The script logs the shipping option ID at the end.
 * Set it as FLAT_SHIPPING_OPTION_ID env var in Railway so the
 * payment-sessions route can auto-add it to every cart.
 */

import { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/core-flows"

export default async function setupShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentService = container.resolve(Modules.FULFILLMENT)

  // ── 1. Find existing stock location ──────────────────────────────────────
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })

  if (!locations.length) {
    logger.error("No stock location found. Run seed-novapatch.ts first.")
    return
  }
  const locationId = locations[0].id
  logger.info(`Using stock location: ${locationId} (${locations[0].name})`)

  // ── 2. Check if fulfillment set already exists for this location ──────────
  const { data: existingSets } = await query.graph({
    entity: "stock_location",
    filters: { id: locationId },
    fields: ["id", "fulfillment_sets.id", "fulfillment_sets.name"],
  })

  let fulfillmentSetId: string
  const existingFulfillmentSets = (existingSets[0] as any)?.fulfillment_sets ?? []

  if (existingFulfillmentSets.length) {
    fulfillmentSetId = existingFulfillmentSets[0].id
    logger.info(`Fulfillment set already exists: ${fulfillmentSetId}`)
  } else {
    // ── 3. Create FulfillmentSet linked to stock location ─────────────────
    logger.info("Creating fulfillment set...")
    await createLocationFulfillmentSetWorkflow(container).run({
      input: {
        location_id: locationId,
        fulfillment_set_data: {
          name: "Novapatch Shipping",
          type: "shipping",
        },
      },
    })
    // Workflow doesn't return the set — re-query to get the ID
    const { data: refreshed } = await query.graph({
      entity: "stock_location",
      filters: { id: locationId },
      fields: ["id", "fulfillment_sets.id"],
    })
    fulfillmentSetId = ((refreshed[0] as any)?.fulfillment_sets ?? [])[0]?.id
    if (!fulfillmentSetId) {
      logger.error("Fulfillment set was not created.")
      return
    }
    logger.info(`Fulfillment set created: ${fulfillmentSetId}`)
  }

  // ── 4. Check or create ServiceZone for Mexico ─────────────────────────────
  const { data: fsets } = await query.graph({
    entity: "fulfillment_set",
    filters: { id: fulfillmentSetId },
    fields: ["id", "service_zones.id", "service_zones.name"],
  })

  let serviceZoneId: string
  const existingZones = (fsets[0] as any)?.service_zones ?? []

  if (existingZones.length) {
    serviceZoneId = existingZones[0].id
    logger.info(`Service zone already exists: ${serviceZoneId}`)
  } else {
    logger.info("Creating service zone for Mexico...")
    const { result: zones } = await createServiceZonesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Mexico",
            fulfillment_set_id: fulfillmentSetId,
            geo_zones: [{ type: "country", country_code: "mx" }],
          },
        ],
      },
    })
    serviceZoneId = (zones as any[])[0].id
    logger.info(`Service zone created: ${serviceZoneId}`)
  }

  // ── 5. Check or create ShippingProfile ────────────────────────────────────
  const profiles = await fulfillmentService.listShippingProfiles({ name: "Default" })
  let shippingProfileId: string

  if (profiles.length) {
    shippingProfileId = profiles[0].id
    logger.info(`Shipping profile already exists: ${shippingProfileId}`)
  } else {
    logger.info("Creating default shipping profile...")
    const { result: profileResult } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default", type: "default" }] },
    })
    shippingProfileId = (profileResult as any[])[0].id
    logger.info(`Shipping profile created: ${shippingProfileId}`)
  }

  // ── 6. Get available fulfillment provider ─────────────────────────────────
  const providers = await fulfillmentService.listFulfillmentProviders({})
  if (!providers.length) {
    logger.error("No fulfillment providers registered. Add @medusajs/fulfillment-manual to medusa-config.ts.")
    return
  }
  const providerId = providers[0].id
  logger.info(`Using fulfillment provider: ${providerId}`)

  // ── 7. Check if flat-rate shipping option already exists ──────────────────
  const existingOptions = await fulfillmentService.listShippingOptions({
    name: "Envío estándar a domicilio",
  })

  if (existingOptions.length) {
    logger.info(`Shipping option already exists: ${existingOptions[0].id}`)
    logger.info(`=== FLAT_SHIPPING_OPTION_ID=${existingOptions[0].id} ===`)
    return
  }

  // ── 8. Link fulfillment provider to stock location via remote link ─────────
  logger.info(`Linking provider ${providerId} to stock location ${locationId}...`)
  try {
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
    await remoteLink.create([
      {
        [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: providerId },
      },
    ])
    logger.info("Provider linked to stock location.")
  } catch (e) {
    // May already be linked — non-fatal
    logger.warn(`Provider link (may already exist): ${(e as Error).message}`)
  }

  // ── 9. Create flat-rate shipping option ($85 MXN) ────────────────────────
  logger.info("Creating shipping option ($85 MXN flat rate)...")
  const { result: shippingOptions } = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Envío estándar a domicilio",
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfileId,
        provider_id: providerId,
        type: {
          label: "Estándar",
          description: "Envío a domicilio en México",
          code: "standard",
        },
        price_type: "flat",
        prices: [
          {
            amount: 8500, // $85.00 MXN in centavos
            currency_code: "mxn",
          },
        ],
      },
    ],
  })

  const shippingOptionId = (shippingOptions as any[])[0].id
  logger.info(`Shipping option created: ${shippingOptionId}`)
  logger.info(`=== FLAT_SHIPPING_OPTION_ID=${shippingOptionId} ===`)
  logger.info("Set this as an environment variable in Railway!")
}
