// src/scripts/update-ar-payment-provider.ts
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

export default async function updateArPaymentProvider({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionService = container.resolve(Modules.REGION)

  logger.info("[update-ar-payment-provider] Looking for Argentina region...")

  const regions = await regionService.listRegions({ name: "Argentina" })
  if (!regions.length) {
    logger.error("[update-ar-payment-provider] Argentina region not found. Run seed-argentina.ts first.")
    return
  }

  const arRegion = regions[0]
  logger.info(`[update-ar-payment-provider] Found region: ${arRegion.id}`)

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: arRegion.id },
      update: { payment_providers: ["pp_mercadopago"] },
    },
  })

  logger.info("[update-ar-payment-provider] Done. Argentina region now uses pp_mercadopago.")
}
