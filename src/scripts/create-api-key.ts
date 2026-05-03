import { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function createApiKey({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apiKeyService = container.resolve(Modules.API_KEY)
  const scService = container.resolve(Modules.SALES_CHANNEL)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  // List existing keys
  const existing = await apiKeyService.listApiKeys({})
  logger.info(`Existing API keys: ${existing.length}`)
  for (const k of existing) {
    logger.info(`  ${k.id} type=${k.type} token=${k.token} title=${k.title}`)
  }

  const channels = await scService.listSalesChannels({})
  logger.info(`Sales channels: ${channels.length}`)
  if (channels.length === 0) {
    logger.error("No sales channel found. Run seed-novapatch first.")
    return
  }
  for (const ch of channels) {
    logger.info(`  ${ch.id} "${ch.name}"`)
  }

  // Create a publishable key if none exists, otherwise reuse the first one
  let publishableKey = existing.find((k: any) => k.type === "publishable")
  if (!publishableKey) {
    logger.info("No publishable key found — creating one...")
    const [created] = await apiKeyService.createApiKeys([{
      title: "Storefront staging",
      type: "publishable" as any,
      created_by: "system",
    }])
    publishableKey = created
    logger.info(`Created publishable key ${publishableKey.id} token=${publishableKey.token}`)
  }

  // Link to the first sales channel
  try {
    await remoteLink.create([{
      [Modules.API_KEY]: { publishable_key_id: publishableKey.id },
      [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id },
    }])
    logger.info(`Linked key ${publishableKey.id} → channel ${channels[0].id}`)
  } catch (e) {
    logger.warn(`Link may already exist: ${(e as Error).message}`)
  }

  logger.info("")
  logger.info("=== Use this token as NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ===")
  logger.info(publishableKey.token)
}
