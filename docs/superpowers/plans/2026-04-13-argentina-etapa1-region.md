# Argentina Etapa 1 — Region + ARS Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Argentina region to Medusa with ARS pricing on all 24 SKUs, deployable without touching Mexico data.

**Architecture:** A single idempotent script `seed-argentina.ts` that (1) adds ARS to the store's supported currencies, (2) creates the Argentina region with `pp_system_default`, and (3) patches all 24 existing variants with ARS prices. No schema changes, no module changes.

**Tech Stack:** Medusa.js v2, `updateProductVariantsWorkflow`, `createRegionsWorkflow`, `updateStoresWorkflow`

---

## Prices Reference

| SKU suffix | ARS amount (major units) |
|------------|--------------------------|
| `once`      | 60000 |
| `monthly`   | 48000 |
| `bimonthly` | 51000 |
| `quarterly` | 54000 |

> **Note:** Medusa v2 stores prices in **major units** (pesos, not centavos). This matches `seed-novapatch.ts` which uses `750` for $750 MXN. Use the values in the table above directly.

---

## Task 1: Create branch

- [ ] **Step 1: Create and checkout branch**

```bash
git checkout -b feat/argentina-etapa1-region
```

---

## Task 2: Write `seed-argentina.ts`

**Files:**
- Create: `src/scripts/seed-argentina.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/scripts/seed-argentina.ts
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  updateStoresWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"

// ARS prices in major units (pesos argentinos, not centavos)
// Base price: $60,000 ARS — discounts match MX tiers (20/15/10%)
const ARS_PLAN_PRICES: Record<string, number> = {
  once:      60000,
  monthly:   48000,  // 20% off
  bimonthly: 51000,  // 15% off
  quarterly: 54000,  // 10% off
}

export default async function seedArgentina({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const storeService = container.resolve(Modules.STORE)
  const regionService = container.resolve(Modules.REGION)
  const productService = container.resolve(Modules.PRODUCT)

  logger.info("[seed-argentina] Starting Argentina seed...")

  // 1. Add ARS to supported currencies (idempotent)
  logger.info("[seed-argentina] Updating store supported currencies...")
  const [store] = await storeService.listStores()
  const existingCurrencies = store.supported_currencies ?? []
  const hasArs = existingCurrencies.some((c: any) => c.currency_code === "ars")

  if (!hasArs) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            ...existingCurrencies.map((c: any) => ({
              currency_code: c.currency_code,
              is_default: c.is_default ?? false,
            })),
            { currency_code: "ars", is_default: false },
          ],
        },
      },
    })
    logger.info("[seed-argentina] ARS added to supported currencies")
  } else {
    logger.info("[seed-argentina] ARS already present — skipping currency update")
  }

  // 2. Create Argentina region (idempotent)
  const existingRegions = await regionService.listRegions({ name: "Argentina" })

  if (!existingRegions.length) {
    logger.info("[seed-argentina] Creating Argentina region...")
    try {
      const { result } = await createRegionsWorkflow(container).run({
        input: {
          regions: [{
            name: "Argentina",
            currency_code: "ars",
            countries: ["ar"],
            payment_providers: ["pp_system_default"],
          }],
        },
      })
      logger.info(`[seed-argentina] Argentina region created: ${result[0].id}`)
    } catch {
      logger.warn("[seed-argentina] Region creation with payment provider failed, retrying without...")
      const { result } = await createRegionsWorkflow(container).run({
        input: {
          regions: [{
            name: "Argentina",
            currency_code: "ars",
            countries: ["ar"],
          }],
        },
      })
      logger.info(`[seed-argentina] Argentina region created (no payment provider): ${result[0].id}`)
    }
  } else {
    logger.info(`[seed-argentina] Argentina region already exists: ${existingRegions[0].id} — skipping`)
  }

  // 3. Add ARS prices to all 24 variants
  logger.info("[seed-argentina] Fetching variants...")
  const variants = await productService.listProductVariants(
    {},
    { select: ["id", "sku"] }
  )
  logger.info(`[seed-argentina] Found ${variants.length} variants`)

  let updated = 0
  let skipped = 0

  for (const variant of variants) {
    const sku = variant.sku ?? ""
    // SKU format: "{product}-{plan}" e.g. "energy-monthly"
    const plan = sku.split("-").pop()

    if (!plan || !(plan in ARS_PLAN_PRICES)) {
      logger.warn(`[seed-argentina] Unknown plan for SKU "${sku}" — skipping`)
      skipped++
      continue
    }

    try {
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: [{
            id: variant.id,
            prices: [{ currency_code: "ars", amount: ARS_PLAN_PRICES[plan] }],
          }],
        },
      })
      logger.info(`[seed-argentina] ✓ SKU "${sku}" → $${ARS_PLAN_PRICES[plan].toLocaleString()} ARS`)
      updated++
    } catch (err) {
      logger.error(
        `[seed-argentina] ✗ SKU "${sku}": ${err instanceof Error ? err.message : String(err)}`
      )
      skipped++
    }
  }

  logger.info(
    `[seed-argentina] Done. Updated: ${updated} | Skipped/Failed: ${skipped}`
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are import errors, check that `@medusajs/medusa/core-flows` exports `updateProductVariantsWorkflow` — it does in the existing `update-prices.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/seed-argentina.ts
git commit -m "feat(argentina): add seed-argentina script — region AR + ARS prices"
```

---

## Task 3: Run the seed in development

- [ ] **Step 1: Ensure dev server is NOT running** (seed uses the container, not HTTP)

- [ ] **Step 2: Run seed**

```bash
npx medusa exec ./src/scripts/seed-argentina.ts
```

Expected output:
```
[seed-argentina] Starting Argentina seed...
[seed-argentina] Updating store supported currencies...
[seed-argentina] ARS added to supported currencies
[seed-argentina] Creating Argentina region...
[seed-argentina] Argentina region created: reg_XXXXXXXX
[seed-argentina] Fetching variants...
[seed-argentina] Found 24 variants
[seed-argentina] ✓ SKU "energy-once" → $60,000 ARS
[seed-argentina] ✓ SKU "energy-monthly" → $48,000 ARS
... (24 lines)
[seed-argentina] Done. Updated: 24 | Skipped/Failed: 0
```

- [ ] **Step 3: Verify via Medusa admin**

Open `http://localhost:9000/app` → Settings → Regions. Confirm "Argentina" appears with currency ARS.

Open any product → Variants → click a variant → Prices. Confirm ARS price is listed.

- [ ] **Step 4: Verify idempotency**

Run the seed a second time:

```bash
npx medusa exec ./src/scripts/seed-argentina.ts
```

Expected: "ARS already present — skipping", "Argentina region already exists — skipping", and all 24 variants updated again with the same price (no error, no duplicates).

---

## Task 4: Final commit and push

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```

Expected: nothing to commit.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/argentina-etapa1-region
```
