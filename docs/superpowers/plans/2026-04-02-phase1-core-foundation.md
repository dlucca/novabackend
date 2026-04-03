# Phase 1: Core Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Medusa.js v2 project with the Subscription custom module, product seed data (6 SKUs × 4 price tiers), subscription API routes for the storefront, and Clerk JWT authentication middleware.

**Architecture:** Fresh Medusa v2 application with one custom module (`subscription`) containing `Subscription` and `SubscriptionOrder` data models. Module links connect subscriptions to Medusa's native `customer`, `product`, and `order` entities. Custom `/store/me/*` API routes expose subscription management. Clerk middleware validates JWT tokens on protected routes.

**Tech Stack:** Medusa.js v2, PostgreSQL, Redis, TypeScript, Clerk (`@clerk/backend`)

---

## File Structure

```
novabackend/
├── medusa-config.ts                                    # Medusa configuration (DB, Redis, modules)
├── package.json
├── tsconfig.json
├── .env                                                # Environment variables
├── .gitignore
├── src/
│   ├── modules/
│   │   └── subscription/
│   │       ├── index.ts                                # Module definition + export
│   │       ├── service.ts                              # Service extending MedusaService factory
│   │       └── models/
│   │           ├── subscription.ts                     # Subscription data model (DML)
│   │           └── subscription-order.ts               # SubscriptionOrder data model (DML)
│   ├── links/
│   │   ├── subscription-customer.ts                    # Subscription ↔ Customer link
│   │   ├── subscription-product-variant.ts             # Subscription ↔ ProductVariant link
│   │   ├── subscription-order-link.ts                  # Subscription ↔ Order (original_order) link
│   │   └── subscription-order-order.ts                 # SubscriptionOrder ↔ Order link
│   ├── api/
│   │   ├── middlewares.ts                              # Clerk auth middleware + route protection
│   │   └── store/
│   │       └── me/
│   │           └── subscriptions/
│   │               ├── route.ts                        # GET /store/me/subscriptions
│   │               ├── [id]/
│   │               │   ├── pause/route.ts              # POST /store/me/subscriptions/:id/pause
│   │               │   ├── resume/route.ts             # POST /store/me/subscriptions/:id/resume
│   │               │   ├── cancel/route.ts             # POST /store/me/subscriptions/:id/cancel
│   │               │   └── frequency/route.ts          # POST /store/me/subscriptions/:id/frequency
│   ├── workflows/
│   │   ├── pause-subscription/
│   │   │   ├── index.ts                                # Workflow definition
│   │   │   └── steps/
│   │   │       └── pause-subscription.ts               # Step: update status to paused
│   │   ├── resume-subscription/
│   │   │   ├── index.ts
│   │   │   └── steps/
│   │   │       └── resume-subscription.ts
│   │   ├── cancel-subscription/
│   │   │   ├── index.ts
│   │   │   └── steps/
│   │   │       └── cancel-subscription.ts
│   │   └── update-subscription-frequency/
│   │       ├── index.ts
│   │       └── steps/
│   │           └── update-frequency.ts
│   ├── scripts/
│   │   └── seed-novapatch.ts                           # Seed 6 products with 4 price tiers
│   └── subscribers/                                    # (empty for now, Phase 2)
├── CLAUDE.md
├── Documento de Requisitos de Producto.docx
└── READMEFrontend.md
```

---

### Task 1: Create Medusa Project

**Files:**
- Create: `package.json`, `medusa-config.ts`, `tsconfig.json`, `.env`, `.gitignore`

- [ ] **Step 1: Scaffold the Medusa project**

Run from the parent directory of `novabackend` (i.e., `/Users/dlucca/Projects/Novapatch/`). Since `novabackend/` already exists with docs, we'll create the project in a temp directory and move files:

```bash
cd /Users/dlucca/Projects/Novapatch
npx create-medusa-app@latest novabackend-temp --skip-db --no-browser
```

When prompted, accept defaults. This creates the scaffolded project.

- [ ] **Step 2: Move scaffolded files into novabackend**

```bash
# Move all scaffolded files (excluding node_modules) into novabackend
cp -r novabackend-temp/package.json novabackend/
cp -r novabackend-temp/medusa-config.ts novabackend/
cp -r novabackend-temp/tsconfig.json novabackend/
cp -r novabackend-temp/.gitignore novabackend/
cp -r novabackend-temp/.env.template novabackend/.env.template
cp -r novabackend-temp/src novabackend/
# Copy any other config files that were generated
cp -r novabackend-temp/integration-tests novabackend/ 2>/dev/null || true
rm -rf novabackend-temp
```

- [ ] **Step 3: Create .env file**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
```

Create `.env` with the following content:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novapatch

# Redis
REDIS_URL=redis://localhost:6379

# Medusa
STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:5173
AUTH_CORS=http://localhost:3000
JWT_SECRET=novapatch-jwt-secret-dev
COOKIE_SECRET=novapatch-cookie-secret-dev

# Clerk
CLERK_SECRET_KEY=

# Openpay (Phase 2)
OPENPAY_MERCHANT_ID=
OPENPAY_PRIVATE_KEY=
OPENPAY_PUBLIC_KEY=
OPENPAY_SANDBOX=true
```

- [ ] **Step 4: Configure medusa-config.ts with Redis**

Replace the contents of `medusa-config.ts`:

```ts
import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  modules: [
    {
      resolve: "./src/modules/subscription",
    },
  ],
})
```

- [ ] **Step 5: Install dependencies and verify project starts**

```bash
npm install
npx medusa db:migrate
npx medusa develop
```

Expected: Server starts on `http://localhost:9000`. Stop it after confirming.

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Medusa v2 project with Redis config"
```

---

### Task 2: Create Subscription Module — Data Models

**Files:**
- Create: `src/modules/subscription/models/subscription.ts`
- Create: `src/modules/subscription/models/subscription-order.ts`
- Create: `src/modules/subscription/service.ts`
- Create: `src/modules/subscription/index.ts`

- [ ] **Step 1: Create the Subscription data model**

```ts
// src/modules/subscription/models/subscription.ts
import { model } from "@medusajs/framework/utils"

export const SubscriptionStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELED: "canceled",
  PAST_DUE: "past_due",
  DELAYED_OUT_OF_STOCK: "delayed_out_of_stock",
} as const

const Subscription = model.define("subscription", {
  id: model.id().primaryKey(),
  status: model.text().default("active"),
  interval_days: model.number(),
  next_billing_date: model.dateTime(),
  metadata: model.json().nullable(),
  subscription_orders: model.hasMany(() => SubscriptionOrder, {
    mappedBy: "subscription",
  }),
})

export default Subscription

// Forward reference — resolved after SubscriptionOrder is defined
import SubscriptionOrder from "./subscription-order"
```

- [ ] **Step 2: Create the SubscriptionOrder data model**

```ts
// src/modules/subscription/models/subscription-order.ts
import { model } from "@medusajs/framework/utils"
import Subscription from "./subscription"

const SubscriptionOrder = model.define("subscription_order", {
  id: model.id().primaryKey(),
  cycle_number: model.number(),
  subscription: model.belongsTo(() => Subscription, {
    mappedBy: "subscription_orders",
  }),
})

export default SubscriptionOrder
```

- [ ] **Step 3: Create the module service**

```ts
// src/modules/subscription/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import Subscription from "./models/subscription"
import SubscriptionOrder from "./models/subscription-order"

class SubscriptionModuleService extends MedusaService({
  Subscription,
  SubscriptionOrder,
}) {}

export default SubscriptionModuleService
```

- [ ] **Step 4: Create the module definition**

```ts
// src/modules/subscription/index.ts
import SubscriptionModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const SUBSCRIPTION_MODULE = "subscriptionModuleService"

export default Module(SUBSCRIPTION_MODULE, {
  service: SubscriptionModuleService,
})
```

- [ ] **Step 5: Verify medusa-config.ts already includes the module**

The module was already added in Task 1 Step 4. Confirm this line exists in `medusa-config.ts`:

```ts
modules: [
  {
    resolve: "./src/modules/subscription",
  },
],
```

- [ ] **Step 6: Generate and run migrations**

```bash
npx medusa db:generate subscriptionModuleService
npx medusa db:migrate
```

Expected: Migration files are created. Tables `subscription` and `subscription_order` exist in PostgreSQL.

- [ ] **Step 7: Verify by starting the server**

```bash
npx medusa develop
```

Expected: No errors related to the subscription module. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add src/modules/subscription
git commit -m "feat: add Subscription module with Subscription and SubscriptionOrder data models"
```

---

### Task 3: Define Module Links

**Files:**
- Create: `src/links/subscription-customer.ts`
- Create: `src/links/subscription-product-variant.ts`
- Create: `src/links/subscription-order-link.ts`
- Create: `src/links/subscription-order-order.ts`

- [ ] **Step 1: Create Subscription ↔ Customer link**

A customer has many subscriptions.

```ts
// src/links/subscription-customer.ts
import SubscriptionModule from "../modules/subscription"
import CustomerModule from "@medusajs/medusa/customer"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  CustomerModule.linkable.customer,
  {
    linkable: SubscriptionModule.linkable.subscription,
    isList: true,
  }
)
```

- [ ] **Step 2: Create Subscription ↔ ProductVariant link**

Each subscription references a product variant (SKU).

```ts
// src/links/subscription-product-variant.ts
import SubscriptionModule from "../modules/subscription"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  SubscriptionModule.linkable.subscription,
  ProductModule.linkable.productVariant
)
```

- [ ] **Step 3: Create Subscription ↔ Order link (original order)**

Each subscription references the original order that created it.

```ts
// src/links/subscription-order-link.ts
import SubscriptionModule from "../modules/subscription"
import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  SubscriptionModule.linkable.subscription,
  OrderModule.linkable.order
)
```

- [ ] **Step 4: Create SubscriptionOrder ↔ Order link**

Each subscription order (renewal cycle) references the order created for that cycle.

```ts
// src/links/subscription-order-order.ts
import SubscriptionModule from "../modules/subscription"
import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  SubscriptionModule.linkable.subscriptionOrder,
  OrderModule.linkable.order
)
```

- [ ] **Step 5: Sync links to database**

```bash
npx medusa db:migrate
```

Expected: Link tables are created in the database. No errors.

- [ ] **Step 6: Commit**

```bash
git add src/links
git commit -m "feat: define module links between Subscription, Customer, ProductVariant, and Order"
```

---

### Task 4: Seed 6 Products with 4 Price Tiers

**Files:**
- Create: `src/scripts/seed-novapatch.ts`

- [ ] **Step 1: Create the seed script**

```ts
// src/scripts/seed-novapatch.ts
import { ExecArgs } from "@medusajs/framework/types"
import {
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  createStockLocationsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
import { Modules, ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"

const PRODUCTS = [
  { slug: "energy", name: "Energy", description: "Parche vitamínico de energía" },
  { slug: "sleep", name: "Sleep", description: "Parche vitamínico para dormir" },
  { slug: "glow", name: "Glow", description: "Parche vitamínico para la piel" },
  { slug: "shield", name: "Shield", description: "Parche vitamínico para inmunidad" },
  { slug: "zen", name: "Zen", description: "Parche vitamínico para relajación" },
  { slug: "woman", name: "Woman", description: "Parche vitamínico para mujer" },
]

// Base price in MXN (centavos). Example: 39900 = $399.00 MXN
const BASE_PRICE = 39900

// Discount tiers
const TIERS = [
  { suffix: "once", discount: 0 },
  { suffix: "monthly", discount: 20 },
  { suffix: "bimonthly", discount: 15 },
  { suffix: "quarterly", discount: 10 },
]

export default async function seedNovapatch({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)

  logger.info("Starting Novapatch seed...")

  // 1. Ensure default sales channel exists
  let salesChannels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })
  let defaultSalesChannelId: string

  if (salesChannels.length === 0) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          { name: "Default Sales Channel", description: "Novapatch storefront" },
        ],
      },
    })
    defaultSalesChannelId = result[0].id
    logger.info(`Created default sales channel: ${defaultSalesChannelId}`)
  } else {
    defaultSalesChannelId = salesChannels[0].id
    logger.info(`Using existing sales channel: ${defaultSalesChannelId}`)
  }

  // 2. Create stock location
  const { result: stockLocations } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Novapatch Warehouse MX",
          address: {
            address_1: "Mexico City",
            country_code: "mx",
          },
        },
      ],
    },
  })
  const stockLocationId = stockLocations[0].id

  // Link sales channel to stock location
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocationId,
      add: [defaultSalesChannelId],
    },
  })

  // 3. Create Mexico region
  const { result: regions } = await createRegionsWorkflow(container).run({
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
  const regionId = regions[0].id
  logger.info(`Created Mexico region: ${regionId}`)

  // 4. Create products with variants for each price tier
  const productsData = PRODUCTS.map((product) => ({
    title: product.name,
    handle: product.slug,
    description: product.description,
    status: ProductStatus.PUBLISHED,
    options: [
      {
        title: "Plan",
        values: ["Once", "Monthly", "Bimonthly", "Quarterly"],
      },
    ],
    variants: TIERS.map((tier) => {
      const price = Math.round(BASE_PRICE * (1 - tier.discount / 100))
      return {
        title: `${product.name} - ${tier.suffix}`,
        sku: `${product.slug}-${tier.suffix}`,
        manage_inventory: true,
        prices: [
          {
            currency_code: "mxn",
            amount: price,
          },
        ],
        options: {
          Plan: tier.suffix === "once" ? "Once"
            : tier.suffix === "monthly" ? "Monthly"
            : tier.suffix === "bimonthly" ? "Bimonthly"
            : "Quarterly",
        },
        metadata: {
          is_subscription: tier.suffix !== "once",
          interval_days: tier.suffix === "monthly" ? 30
            : tier.suffix === "bimonthly" ? 60
            : tier.suffix === "quarterly" ? 90
            : null,
          discount_percentage: tier.discount > 0 ? tier.discount : null,
        },
      }
    }),
    sales_channels: [{ id: defaultSalesChannelId }],
  }))

  const { result: products } = await createProductsWorkflow(container).run({
    input: { products: productsData },
  })
  logger.info(`Seeded ${products.length} products`)

  // 5. Create inventory levels for all variants
  const inventoryService = container.resolve(Modules.INVENTORY)
  const allVariantIds = products.flatMap((p) =>
    p.variants.map((v) => v.id)
  )

  // Query inventory items linked to variants
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  })

  if (inventoryItems.length > 0) {
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: inventoryItems.map((item) => ({
          inventory_item_id: item.id,
          location_id: stockLocationId,
          stocked_quantity: 1000,
        })),
      },
    })
    logger.info(`Created inventory levels for ${inventoryItems.length} items`)
  }

  logger.info("Novapatch seed complete!")
}
```

- [ ] **Step 2: Run the seed script**

```bash
npx medusa exec ./src/scripts/seed-novapatch.ts
```

Expected: Output shows 6 products seeded with inventory levels. No errors.

- [ ] **Step 3: Verify products via API**

```bash
curl http://localhost:9000/store/products | python3 -m json.tool | head -30
```

Expected: JSON response listing the 6 products with their variants and prices.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/seed-novapatch.ts
git commit -m "feat: add seed script for 6 Novapatch products with 4 price tiers"
```

---

### Task 5: Subscription Management Workflows

**Files:**
- Create: `src/workflows/pause-subscription/steps/pause-subscription.ts`
- Create: `src/workflows/pause-subscription/index.ts`
- Create: `src/workflows/resume-subscription/steps/resume-subscription.ts`
- Create: `src/workflows/resume-subscription/index.ts`
- Create: `src/workflows/cancel-subscription/steps/cancel-subscription.ts`
- Create: `src/workflows/cancel-subscription/index.ts`
- Create: `src/workflows/update-subscription-frequency/steps/update-frequency.ts`
- Create: `src/workflows/update-subscription-frequency/index.ts`

- [ ] **Step 1: Create pause-subscription step**

```ts
// src/workflows/pause-subscription/steps/pause-subscription.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type PauseInput = { subscription_id: string }

export const pauseSubscriptionStep = createStep(
  "pause-subscription-step",
  async ({ subscription_id }: PauseInput, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    const [existing] = await subscriptionService.listSubscriptions({
      id: subscription_id,
    })

    if (!existing) {
      throw new Error(`Subscription ${subscription_id} not found`)
    }
    if (existing.status !== "active") {
      throw new Error(`Cannot pause subscription with status: ${existing.status}`)
    }

    const updated = await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: "paused",
    })

    return new StepResponse(updated, {
      subscription_id,
      previous_status: existing.status,
    })
  },
  async ({ subscription_id, previous_status }, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: previous_status,
    })
  }
)
```

- [ ] **Step 2: Create pause-subscription workflow**

```ts
// src/workflows/pause-subscription/index.ts
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { pauseSubscriptionStep } from "./steps/pause-subscription"

type WorkflowInput = { subscription_id: string }

const pauseSubscriptionWorkflow = createWorkflow(
  "pause-subscription",
  function (input: WorkflowInput) {
    const result = pauseSubscriptionStep(input)
    return new WorkflowResponse(result)
  }
)

export default pauseSubscriptionWorkflow
```

- [ ] **Step 3: Create resume-subscription step**

```ts
// src/workflows/resume-subscription/steps/resume-subscription.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type ResumeInput = { subscription_id: string }

export const resumeSubscriptionStep = createStep(
  "resume-subscription-step",
  async ({ subscription_id }: ResumeInput, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    const [existing] = await subscriptionService.listSubscriptions({
      id: subscription_id,
    })

    if (!existing) {
      throw new Error(`Subscription ${subscription_id} not found`)
    }
    if (existing.status !== "paused") {
      throw new Error(`Cannot resume subscription with status: ${existing.status}`)
    }

    // Recalculate next billing date from today
    const now = new Date()
    const nextBilling = new Date(now)
    nextBilling.setDate(nextBilling.getDate() + existing.interval_days)

    const updated = await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: "active",
      next_billing_date: nextBilling,
    })

    return new StepResponse(updated, {
      subscription_id,
      previous_status: existing.status,
      previous_next_billing_date: existing.next_billing_date,
    })
  },
  async ({ subscription_id, previous_status, previous_next_billing_date }, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: previous_status,
      next_billing_date: previous_next_billing_date,
    })
  }
)
```

- [ ] **Step 4: Create resume-subscription workflow**

```ts
// src/workflows/resume-subscription/index.ts
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { resumeSubscriptionStep } from "./steps/resume-subscription"

type WorkflowInput = { subscription_id: string }

const resumeSubscriptionWorkflow = createWorkflow(
  "resume-subscription",
  function (input: WorkflowInput) {
    const result = resumeSubscriptionStep(input)
    return new WorkflowResponse(result)
  }
)

export default resumeSubscriptionWorkflow
```

- [ ] **Step 5: Create cancel-subscription step**

```ts
// src/workflows/cancel-subscription/steps/cancel-subscription.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type CancelInput = { subscription_id: string }

export const cancelSubscriptionStep = createStep(
  "cancel-subscription-step",
  async ({ subscription_id }: CancelInput, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    const [existing] = await subscriptionService.listSubscriptions({
      id: subscription_id,
    })

    if (!existing) {
      throw new Error(`Subscription ${subscription_id} not found`)
    }
    if (existing.status === "canceled") {
      throw new Error("Subscription is already canceled")
    }

    const updated = await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: "canceled",
    })

    return new StepResponse(updated, {
      subscription_id,
      previous_status: existing.status,
      previous_next_billing_date: existing.next_billing_date,
    })
  },
  async ({ subscription_id, previous_status, previous_next_billing_date }, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.updateSubscriptions({
      id: subscription_id,
      status: previous_status,
      next_billing_date: previous_next_billing_date,
    })
  }
)
```

- [ ] **Step 6: Create cancel-subscription workflow**

```ts
// src/workflows/cancel-subscription/index.ts
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { cancelSubscriptionStep } from "./steps/cancel-subscription"

type WorkflowInput = { subscription_id: string }

const cancelSubscriptionWorkflow = createWorkflow(
  "cancel-subscription",
  function (input: WorkflowInput) {
    const result = cancelSubscriptionStep(input)
    return new WorkflowResponse(result)
  }
)

export default cancelSubscriptionWorkflow
```

- [ ] **Step 7: Create update-frequency step**

```ts
// src/workflows/update-subscription-frequency/steps/update-frequency.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"

type UpdateFrequencyInput = {
  subscription_id: string
  interval_days: 30 | 60 | 90
}

const VALID_INTERVALS = [30, 60, 90]

export const updateFrequencyStep = createStep(
  "update-frequency-step",
  async ({ subscription_id, interval_days }: UpdateFrequencyInput, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

    if (!VALID_INTERVALS.includes(interval_days)) {
      throw new Error(`Invalid interval_days: ${interval_days}. Must be 30, 60, or 90.`)
    }

    const [existing] = await subscriptionService.listSubscriptions({
      id: subscription_id,
    })

    if (!existing) {
      throw new Error(`Subscription ${subscription_id} not found`)
    }
    if (existing.status !== "active" && existing.status !== "paused") {
      throw new Error(`Cannot update frequency for subscription with status: ${existing.status}`)
    }

    const updated = await subscriptionService.updateSubscriptions({
      id: subscription_id,
      interval_days,
    })

    return new StepResponse(updated, {
      subscription_id,
      previous_interval_days: existing.interval_days,
    })
  },
  async ({ subscription_id, previous_interval_days }, { container }) => {
    const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.updateSubscriptions({
      id: subscription_id,
      interval_days: previous_interval_days,
    })
  }
)
```

- [ ] **Step 8: Create update-frequency workflow**

```ts
// src/workflows/update-subscription-frequency/index.ts
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updateFrequencyStep } from "./steps/update-frequency"

type WorkflowInput = {
  subscription_id: string
  interval_days: 30 | 60 | 90
}

const updateSubscriptionFrequencyWorkflow = createWorkflow(
  "update-subscription-frequency",
  function (input: WorkflowInput) {
    const result = updateFrequencyStep(input)
    return new WorkflowResponse(result)
  }
)

export default updateSubscriptionFrequencyWorkflow
```

- [ ] **Step 9: Commit**

```bash
git add src/workflows
git commit -m "feat: add subscription management workflows (pause, resume, cancel, update frequency)"
```

---

### Task 6: Clerk Auth Middleware

**Files:**
- Create: `src/api/middlewares.ts`
- Modify: `package.json` (add `@clerk/backend` dependency)

- [ ] **Step 1: Install @clerk/backend**

```bash
npm install @clerk/backend
```

- [ ] **Step 2: Create the Clerk validation middleware**

```ts
// src/api/middlewares.ts
import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createClerkClient } from "@clerk/backend"

const clerkMiddleware = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid Authorization header" })
    return
  }

  const token = authHeader.replace("Bearer ", "")
  const clerkSecretKey = process.env.CLERK_SECRET_KEY

  if (!clerkSecretKey) {
    res.status(500).json({ message: "CLERK_SECRET_KEY not configured" })
    return
  }

  try {
    const clerk = createClerkClient({ secretKey: clerkSecretKey })
    const verifiedToken = await clerk.verifyToken(token)

    // Attach Clerk user info to the request for downstream handlers
    ;(req as any).clerk_user_id = verifiedToken.sub
    ;(req as any).clerk_email = verifiedToken.email

    next()
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" })
  }
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/me/*",
      middlewares: [clerkMiddleware],
    },
  ],
})
```

- [ ] **Step 3: Verify middleware loads without errors**

```bash
npx medusa develop
```

Expected: Server starts without middleware errors. Test with a request:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/store/me/subscriptions
```

Expected: `401` (no auth header).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/api/middlewares.ts
git commit -m "feat: add Clerk JWT validation middleware for /store/me/* routes"
```

---

### Task 7: Subscription API Routes

**Files:**
- Create: `src/api/store/me/subscriptions/route.ts`
- Create: `src/api/store/me/subscriptions/[id]/pause/route.ts`
- Create: `src/api/store/me/subscriptions/[id]/resume/route.ts`
- Create: `src/api/store/me/subscriptions/[id]/cancel/route.ts`
- Create: `src/api/store/me/subscriptions/[id]/frequency/route.ts`

- [ ] **Step 1: Create GET /store/me/subscriptions**

```ts
// src/api/store/me/subscriptions/route.ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const clerkUserId = (req as any).clerk_user_id

  if (!clerkUserId) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  // Resolve customer by Clerk ID using query
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Find customer linked to Clerk user
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: {
      metadata: { clerk_user_id: clerkUserId },
    },
  })

  if (customers.length === 0) {
    res.json({ subscriptions: [] })
    return
  }

  const customerId = customers[0].id

  // Get subscriptions linked to customer
  const subscriptionService = req.scope.resolve(SUBSCRIPTION_MODULE)
  const subscriptions = await subscriptionService.listSubscriptions(
    {},
    {
      relations: ["subscription_orders"],
    }
  )

  // Filter by customer via links
  const { data: customerSubscriptionLinks } = await query.graph({
    entity: "customer",
    fields: ["subscriptions.*", "subscriptions.subscription_orders.*"],
    filters: { id: customerId },
  })

  const customerSubscriptions = customerSubscriptionLinks[0]?.subscriptions || []

  res.json({ subscriptions: customerSubscriptions })
}
```

- [ ] **Step 2: Create POST /store/me/subscriptions/:id/pause**

```ts
// src/api/store/me/subscriptions/[id]/pause/route.ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import pauseSubscriptionWorkflow from "../../../../../../workflows/pause-subscription"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params

  // TODO: verify subscription belongs to the authenticated customer (via Clerk ID)

  try {
    const { result } = await pauseSubscriptionWorkflow(req.scope).run({
      input: { subscription_id: id },
    })

    res.json({ subscription: result })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}
```

- [ ] **Step 3: Create POST /store/me/subscriptions/:id/resume**

```ts
// src/api/store/me/subscriptions/[id]/resume/route.ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import resumeSubscriptionWorkflow from "../../../../../../workflows/resume-subscription"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params

  try {
    const { result } = await resumeSubscriptionWorkflow(req.scope).run({
      input: { subscription_id: id },
    })

    res.json({ subscription: result })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}
```

- [ ] **Step 4: Create POST /store/me/subscriptions/:id/cancel**

```ts
// src/api/store/me/subscriptions/[id]/cancel/route.ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import cancelSubscriptionWorkflow from "../../../../../../workflows/cancel-subscription"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params

  try {
    const { result } = await cancelSubscriptionWorkflow(req.scope).run({
      input: { subscription_id: id },
    })

    res.json({ subscription: result })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}
```

- [ ] **Step 5: Create POST /store/me/subscriptions/:id/frequency**

```ts
// src/api/store/me/subscriptions/[id]/frequency/route.ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import updateSubscriptionFrequencyWorkflow from "../../../../../../workflows/update-subscription-frequency"

type UpdateFrequencyBody = {
  interval_days: 30 | 60 | 90
}

export const POST = async (
  req: MedusaRequest<UpdateFrequencyBody>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const { interval_days } = req.body

  if (!interval_days || ![30, 60, 90].includes(interval_days)) {
    res.status(400).json({ message: "interval_days must be 30, 60, or 90" })
    return
  }

  try {
    const { result } = await updateSubscriptionFrequencyWorkflow(req.scope).run({
      input: {
        subscription_id: id,
        interval_days,
      },
    })

    res.json({ subscription: result })
  } catch (error: any) {
    res.status(400).json({ message: error.message })
  }
}
```

- [ ] **Step 6: Verify all routes register**

```bash
npx medusa develop
```

Test each route returns the expected response:

```bash
# Should return 401 (no auth)
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/store/me/subscriptions

# Should return 401 (no auth)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9000/store/me/subscriptions/test-id/pause
```

Expected: All routes return 401 without a valid JWT.

- [ ] **Step 7: Commit**

```bash
git add src/api/store
git commit -m "feat: add subscription API routes (list, pause, resume, cancel, frequency)"
```

---

### Task 8: Update CLAUDE.md and Final Verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Verify full stack**

```bash
# Start the server
npx medusa develop
```

In a separate terminal, verify:

```bash
# Health check
curl http://localhost:9000/health

# Products seeded
curl http://localhost:9000/store/products | python3 -m json.tool | head -5

# Auth middleware active
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/store/me/subscriptions
```

Expected:
- Health: `{"status":"ok"}` or similar
- Products: JSON listing products
- Subscriptions: `401`

- [ ] **Step 2: Update CLAUDE.md with actual project structure**

Add the following section to `CLAUDE.md` under `## Commands`:

```markdown
## Development

```bash
npx medusa develop          # Dev server on :9000
npx medusa exec ./src/scripts/seed-novapatch.ts  # Seed products
```
```

- [ ] **Step 3: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Phase 1 project details"
```

---

## Phase 1 Summary

After completing all tasks, the backend will have:

1. ✅ Medusa v2 project scaffolded with PostgreSQL + Redis
2. ✅ Subscription module with `Subscription` and `SubscriptionOrder` data models
3. ✅ Module links connecting subscriptions to Customer, ProductVariant, and Order
4. ✅ 6 products seeded with 4 price tiers each (once, monthly, bimonthly, quarterly)
5. ✅ 4 subscription management workflows with compensation functions
6. ✅ Clerk JWT middleware protecting `/store/me/*` routes
7. ✅ 5 subscription API routes matching the frontend contract

**Not included in Phase 1 (deferred):**
- Cart subscriber for subscription discount application
- Cart completion subscriber for subscription creation
- Openpay payment integration
- Daily billing cron job
- Resend email notifications
- Admin dashboard extensions
