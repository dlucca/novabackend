import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
  createInventoryLevelsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

const PRODUCTS = ["energy", "sleep", "glow", "shield", "zen", "woman"] as const

const BASE_PRICE = 39900 // $399.00 MXN in centavos

const PRICE_TIERS = [
  {
    plan: "Once",
    discount: 0,
    is_subscription: false,
    interval_days: null,
    discount_percentage: null,
  },
  {
    plan: "Monthly",
    discount: 20,
    is_subscription: true,
    interval_days: 30,
    discount_percentage: 20,
  },
  {
    plan: "Bimonthly",
    discount: 15,
    is_subscription: true,
    interval_days: 60,
    discount_percentage: 15,
  },
  {
    plan: "Quarterly",
    discount: 10,
    is_subscription: true,
    interval_days: 90,
    discount_percentage: 10,
  },
] as const

function calculatePrice(discount: number): number {
  return Math.round(BASE_PRICE * (1 - discount / 100))
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default async function seedNovapatch({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const storeService = container.resolve(Modules.STORE)

  logger.info("Starting Novapatch seed...")

  // 1. Sales channel
  logger.info("Setting up sales channel...")
  let defaultSalesChannels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })

  if (!defaultSalesChannels.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [{ name: "Default Sales Channel" }],
      },
    })
    defaultSalesChannels = result
  }

  const defaultSalesChannelId = defaultSalesChannels[0].id
  logger.info(`Sales channel ready: ${defaultSalesChannelId}`)

  // Link store to default sales channel
  const [store] = await storeService.listStores()
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [
          { currency_code: "mxn", is_default: true },
        ],
        default_sales_channel_id: defaultSalesChannelId,
      },
    },
  })

  // 2. Stock location
  logger.info("Creating stock location...")
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Novapatch Warehouse MX",
          address: {
            country_code: "mx",
            city: "Mexico City",
            address_1: "",
          },
        },
      ],
    },
  })
  const stockLocation = stockLocationResult[0]
  logger.info(`Stock location created: ${stockLocation.id}`)

  // 3. Link sales channel to stock location
  logger.info("Linking sales channel to stock location...")
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannelId],
    },
  })

  // 4. Mexico region
  logger.info("Creating Mexico region...")
  try {
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Mexico",
            currency_code: "mxn",
            countries: ["mx"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    logger.info(`Region created: ${regionResult[0].id}`)
  } catch (e) {
    logger.warn(
      "Region creation with payment provider failed, retrying without..."
    )
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Mexico",
            currency_code: "mxn",
            countries: ["mx"],
          },
        ],
      },
    })
    logger.info(`Region created (no payment provider): ${regionResult[0].id}`)
  }

  // 5. Create 6 products with 4 variants each
  logger.info("Creating products...")
  const products = PRODUCTS.map((handle) => ({
    title: capitalize(handle),
    handle,
    status: ProductStatus.PUBLISHED,
    options: [
      {
        title: "Plan",
        values: ["Once", "Monthly", "Bimonthly", "Quarterly"],
      },
    ],
    variants: PRICE_TIERS.map((tier) => ({
      title: `${capitalize(handle)} - ${tier.plan.toLowerCase()}`,
      sku: `${handle}-${tier.plan.toLowerCase()}`,
      manage_inventory: true,
      options: { Plan: tier.plan },
      prices: [
        {
          currency_code: "mxn",
          amount: calculatePrice(tier.discount),
        },
      ],
      metadata: {
        is_subscription: tier.is_subscription,
        interval_days: tier.interval_days,
        discount_percentage: tier.discount_percentage,
      },
    })),
    sales_channels: [{ id: defaultSalesChannelId }],
  }))

  const { result: productResult } = await createProductsWorkflow(container).run({
    input: { products },
  })
  logger.info(`Created ${productResult.length} products.`)

  // 6. Create inventory levels for all variants
  logger.info("Creating inventory levels...")
  try {
    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id"],
    })

    const inventoryLevels: CreateInventoryLevelInput[] = inventoryItems.map(
      (item) => ({
        location_id: stockLocation.id,
        stocked_quantity: 1000,
        inventory_item_id: item.id,
      })
    )

    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    })
    logger.info(
      `Created ${inventoryLevels.length} inventory levels (1000 units each).`
    )
  } catch (e) {
    logger.warn(
      `Inventory levels creation failed (non-critical): ${(e as Error).message}`
    )
  }

  logger.info("Novapatch seed complete!")
}
