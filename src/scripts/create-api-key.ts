import { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function createApiKey({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apiKeyService = container.resolve(Modules.API_KEY)

  // List existing keys
  const existing = await apiKeyService.listApiKeys({})
  logger.info(`Existing API keys: ${existing.length}`)
  for (const k of existing) {
    logger.info(`  ${k.id} type=${k.type} token=${k.token} title=${k.title}`)
  }

  // Check sales channel links
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const scService = container.resolve(Modules.SALES_CHANNEL)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  const channels = await scService.listSalesChannels({})
  logger.info(`Sales channels: ${channels.length}`)
  for (const ch of channels) {
    logger.info(`  ${ch.id} "${ch.name}"`)
  }

  // Link the publishable key to the sales channel if not linked
  const publishableKey = existing.find((k: any) => k.type === "publishable")
  if (publishableKey && channels.length > 0) {
    try {
      await remoteLink.create([{
        [Modules.API_KEY]: { api_key_id: publishableKey.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id },
      }])
      logger.info(`Linked key ${publishableKey.id} → channel ${channels[0].id}`)
    } catch (e) {
      logger.warn(`Link may already exist: ${(e as Error).message}`)
    }
  }
}
