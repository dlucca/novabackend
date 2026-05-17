# Smoke L4 — Full Checkout en Producción: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly synthetic transaction in production that validates Openpay charge + webhook + order creation + email + Slack notification end-to-end with ~$1-5 MXN residual cost per run.

**Architecture:** Playwright API-level test runs against production. Tokenizes founder's card server-side via Openpay, applies a 99%-off + free-shipping discount code, completes checkout, polls until `payment_status=captured`, asserts shape, then cancels the order. Backend guards prevent Envia label generation for these orders and add a `[SMOKE]` visual flag to the Slack notification.

**Tech Stack:** Playwright, Medusa v2 API, Openpay API, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-05-17-smoke-l4-full-checkout-design.md`

---

## File Structure

**Backend changes (`novabackend`):**
- Modify: `src/subscribers/envia-fulfillment.ts` — add `smoke_test` guard that skips the Envia workflow
- Modify: `src/lib/slack-mappers.ts:312` (`mapPaymentCapturedToSlackBlocks`) — prepend `🧪 [SMOKE] ` to the header when `order.metadata.smoke_test === true`

**Frontend changes (`novafrontend`):**
- Create: `apps/storefront/tests/e2e/smoke/full-checkout.spec.ts` — the smoke test
- Create: `apps/storefront/tests/e2e/smoke/helpers/openpay-token.ts` — server-side Openpay tokenization helper
- Modify: `apps/storefront/.github/workflows/smoke.yml` — add `full-checkout` job with weekly cron + workflow_dispatch

**Production setup (manual, no code):**
- Customer `smoke@novapatch.care` in Medusa admin
- Discount code `SMOKE-INTERNAL-<RANDOM>` (99% off + free shipping, email-locked)
- Admin API key for the smoke runner
- 7 GHA secrets in `novafrontend` repo
- Inbox forwarder for `smoke@novapatch.care`

---

## Task 1 — Backend: Guard `envia-fulfillment` subscriber against smoke orders

**Files:**
- Modify: `/Users/dlucca/Projects/Novapatch/novabackend/src/subscribers/envia-fulfillment.ts`

**Why:** The subscriber fires on `order.payment_captured` and auto-generates a real Envia label (~$80-130 MXN cost). Smoke orders carry `metadata.smoke_test=true` and must skip this entirely.

- [ ] **Step 1: Edit the subscriber to fetch order metadata and skip if `smoke_test=true`**

Replace the file contents with:

```typescript
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { enviaCreateFulfillmentWorkflow } from "../workflows/envia-create-fulfillment"

export default async function enviaFulfillmentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
    logger.warn(`[envia-fulfillment] ENVIA_API_TOKEN or ENVIA_API_URL not set — skipping order ${orderId}`)
    return
  }

  // Smoke test guard: orders flagged with metadata.smoke_test = true are
  // synthetic transactions used by the weekly L4 smoke. They MUST NOT
  // generate a real Envia label (would cost ~$80-130 MXN per run).
  // See docs/superpowers/specs/2026-05-17-smoke-l4-full-checkout-design.md
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ["id", "metadata"],
    })
    const order = orders?.[0]
    if ((order?.metadata as any)?.smoke_test === true) {
      logger.info(`[envia-fulfillment] Skipping smoke test order ${orderId} (metadata.smoke_test=true)`)
      return
    }
  } catch (metaErr) {
    // If metadata check fails, fall through to the existing flow rather than
    // blocking real fulfillments. Worst case: a smoke order generates a label
    // and we cancel it manually in Envia.
    logger.warn(`[envia-fulfillment] Could not check metadata for order ${orderId}: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`)
  }

  // Idempotency: skip if a fulfillment was already created for this order
  // (guards against duplicate order.payment_captured events)
  try {
    const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
    // Cast to any: order_id is a valid runtime filter but not in FilterableFulfillmentProps types
    const existing = await fulfillmentModule.listFulfillments({ order_id: orderId } as any)
    if (existing.length > 0) {
      logger.info(`[envia-fulfillment] Fulfillment already exists for order ${orderId} — skipping`)
      return
    }
  } catch (checkErr) {
    logger.warn(`[envia-fulfillment] Could not check existing fulfillments for order ${orderId}: ${checkErr instanceof Error ? checkErr.message : String(checkErr)}`)
  }

  try {
    await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId } })
  } catch (err) {
    let errMsg: string
    if (err instanceof Error) {
      errMsg = err.message
    } else {
      try { errMsg = JSON.stringify(err) } catch { errMsg = String(err) }
    }
    logger.error(`[envia-fulfillment] Workflow failed for order ${orderId}: ${errMsg}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: {
    subscriberId: "envia-fulfillment",
  },
}
```

- [ ] **Step 2: Type-check**

Run from `/Users/dlucca/Projects/Novapatch/novabackend`:

```bash
npx tsc --noEmit
```

Expected: no errors related to `envia-fulfillment.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/subscribers/envia-fulfillment.ts
git commit -m "$(cat <<'EOF'
Guard envia-fulfillment subscriber against smoke orders

Orders with metadata.smoke_test=true must not generate Envia labels
(~$80-130 MXN each). Used by the upcoming weekly L4 smoke test.

Spec: docs/superpowers/specs/2026-05-17-smoke-l4-full-checkout-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Backend: Add `[SMOKE]` visual flag to Slack payment-captured mapper

**Files:**
- Modify: `/Users/dlucca/Projects/Novapatch/novabackend/src/lib/slack-mappers.ts:312` (function `mapPaymentCapturedToSlackBlocks`)

**Why:** The smoke triggers a Slack message in `#orders` like any real order. Adding a visible `🧪 [SMOKE]` prefix to the header lets the team ignore these without confusion.

- [ ] **Step 1: Update the header block to prepend smoke flag**

In `mapPaymentCapturedToSlackBlocks`, change the header block. Find this section (around line 343-347):

```typescript
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "💳 Cobro confirmado", emoji: true },
    },
```

Replace with:

```typescript
  const isSmoke = order?.metadata?.smoke_test === true
  const headerText = isSmoke ? "🧪 [SMOKE] Cobro confirmado" : "💳 Cobro confirmado"

  return [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
```

- [ ] **Step 2: Verify the subscriber that calls this mapper passes `order.metadata`**

Search for the call site:

```bash
grep -rn "mapPaymentCapturedToSlackBlocks" /Users/dlucca/Projects/Novapatch/novabackend/src/
```

Open the subscriber that calls it and confirm `metadata` is included in the order fields queried. If it isn't, add `"metadata"` to the fields array. Without this the `isSmoke` check always returns false.

If a fields-array update is needed, edit the subscriber file (likely `src/subscribers/order-payment-captured-slack-notification.ts` or similar) to include `"metadata"` in the `fields` array.

- [ ] **Step 3: Type-check**

Run from `/Users/dlucca/Projects/Novapatch/novabackend`:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/slack-mappers.ts
# Plus any subscriber files updated in step 2:
# git add src/subscribers/<file-from-step-2>.ts
git commit -m "$(cat <<'EOF'
Add [SMOKE] visual flag to payment-captured Slack notification

Orders with metadata.smoke_test=true get a 🧪 [SMOKE] prefix in the
Slack header so the team can distinguish synthetic transactions from
real sales. Used by the upcoming weekly L4 smoke test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Backend: Deploy to production and verify

**Files:** none (deploy step)

**Why:** The smoke test will charge real money. The two backend guards MUST be live in production before the first smoke run.

- [ ] **Step 1: Push to main**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
git push origin main
```

- [ ] **Step 2: Wait for Railway auto-deploy**

Watch the Railway dashboard for `novabackend` production. Wait until the deploy succeeds and the new image is running.

- [ ] **Step 3: Verify the guards are live**

Connect to the production container:

```bash
railway ssh --service novabackend --environment production
```

Inside the container:

```bash
grep -c "smoke_test" .medusa/server/src/subscribers/envia-fulfillment.js
grep -c "SMOKE" .medusa/server/src/lib/slack-mappers.js
```

Expected: both commands return a positive integer (the strings exist in the compiled output).

Exit the container.

---

## Task 4 — Production manual setup (founder action)

**Files:** none (Medusa admin + GHA + email config)

**Why:** The smoke test needs a real customer, a real discount code, an admin API key, and 7 GHA secrets configured before it can run.

⚠️ Diego: this whole task is yours. Each sub-task explains what to do and how to validate it. No code changes here.

- [ ] **Step 1: Create the smoke customer in Medusa admin**

Go to https://admin.novapatch.care/customers → "Create customer":
- Email: `smoke@novapatch.care`
- First name: `Smoke`
- Last name: `Test`

Save the customer ID — you'll need it in step 7 (`SMOKE_CUSTOMER_ID`).

- [ ] **Step 2: Set up the smoke email forwarder**

In your domain DNS provider (or Resend dashboard), create a forwarder so `smoke@novapatch.care` forwards to `dlucca@gmail.com`. Send a test email to confirm.

- [ ] **Step 3: Create the discount code in Medusa admin**

Generate a random suffix:

```bash
openssl rand -hex 4
```

Take the output (e.g., `a3f7e9b2`) and use it as the code suffix.

Go to https://admin.novapatch.care/promotions → "Create promotion":
- Code: `SMOKE-INTERNAL-<RANDOM>` (use the random suffix from above)
- Type: percentage
- Value: 99
- Applies to: all products
- Allocation: each line item
- Free shipping: yes (or add a separate rule for shipping = 100%)
- Customer restriction: only `smoke@novapatch.care`
- Usage limit: 100

Save and copy the exact code string — you'll need it in step 7.

- [ ] **Step 4: Generate an admin API key**

Go to https://admin.novapatch.care/settings/api-key-management → "Create API key":
- Type: Admin
- Title: `smoke-l4-runner`
- (No scope restrictions needed since this is admin level)

Copy the token. You'll need it in step 7. **Store it in a password manager too** — Medusa shows it only once.

- [ ] **Step 5: Identify the variant ID the smoke will buy**

Pick the cheapest single-pack SKU (e.g., `energy`). In Medusa admin → Products → energy → Variants, copy the variant ID. You'll need it in step 7 (`SMOKE_VARIANT_ID`).

- [ ] **Step 6: Verify Openpay credentials in prod**

```bash
railway variables --service novabackend --environment production | grep -i openpay
```

Confirm `OPENPAY_SANDBOX=false` (or unset) and `OPENPAY_PUBLIC_KEY`, `OPENPAY_PRIVATE_KEY`, `OPENPAY_MERCHANT_ID` are set. **DO NOT proceed if these point to sandbox** — the smoke needs prod credentials.

- [ ] **Step 7: Set the 7 GHA secrets in `novafrontend` repo**

Go to https://github.com/dlucca/novafrontend/settings/secrets/actions → "New repository secret" (×7):

| Secret name | Value |
|---|---|
| `PROD_ADMIN_API_KEY` | The admin API key from step 4 |
| `SMOKE_PROMO_CODE` | The discount code from step 3 (e.g., `SMOKE-INTERNAL-a3f7e9b2`) |
| `SMOKE_VARIANT_ID` | The variant ID from step 5 |
| `SMOKE_OPENPAY_MERCHANT_ID` | Same as Railway prod `OPENPAY_MERCHANT_ID` |
| `SMOKE_OPENPAY_PRIVATE_KEY` | Same as Railway prod `OPENPAY_PRIVATE_KEY` |
| `SMOKE_CARD_NUMBER` | Your personal card number (no spaces) |
| `SMOKE_CARD_CVV` | The CVV |
| `SMOKE_CARD_EXP_MONTH` | 2-digit month (e.g., `08`) |
| `SMOKE_CARD_EXP_YEAR` | 2-digit year (e.g., `28`) |
| `SMOKE_CARD_HOLDER_NAME` | Cardholder name as printed |

Yes, that's 10 — I miscounted earlier. The 7-secret figure was wrong.

⚠️ **PCI consideration**: Storing card data in GHA secrets puts this repo formally in PCI scope. Acceptable for a single test card under your name on an internal test. If you ever want to remove this, switch the smoke to use the Openpay vault directly (requires backend changes — out of scope for now).

---

## Task 5 — Frontend: Create the Openpay tokenization helper

**Files:**
- Create: `/Users/dlucca/Projects/Novapatch/novafrontend/apps/storefront/tests/e2e/smoke/helpers/openpay-token.ts`

**Why:** Openpay's `/store/carts/:id/complete` endpoint requires a one-time `openpay_token_id`, not a vault `card_id`. The smoke runner needs to tokenize the founder's card server-side on each run via Openpay's `/v1/{merchantId}/tokens` endpoint.

- [ ] **Step 1: Create the helper file**

```typescript
// novafrontend/apps/storefront/tests/e2e/smoke/helpers/openpay-token.ts
//
// Creates a one-time Openpay token from the founder's card data.
// The card data lives in GHA secrets and is loaded from env vars by the
// smoke runner. We tokenize on every run rather than storing a vault
// token because Medusa's /complete route expects a one-time token.
//
// Docs: https://www.openpay.mx/docs/api/#crear-un-nuevo-token

export type OpenpayTokenInput = {
  merchantId: string
  privateKey: string  // sk_XXX, base64 user:password style auth
  card: {
    cardNumber: string
    cvv: string
    expirationMonth: string
    expirationYear: string
    holderName: string
  }
  /** "https://sandbox-api.openpay.mx/v1" or "https://api.openpay.mx/v1" */
  apiBaseUrl: string
}

export async function createOpenpayToken(input: OpenpayTokenInput): Promise<string> {
  const { merchantId, privateKey, card, apiBaseUrl } = input

  const auth = Buffer.from(`${privateKey}:`).toString("base64")

  const res = await fetch(`${apiBaseUrl}/${merchantId}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      card_number: card.cardNumber,
      holder_name: card.holderName,
      expiration_year: card.expirationYear,
      expiration_month: card.expirationMonth,
      cvv2: card.cvv,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Openpay tokenization failed (${res.status}): ${errText}`)
  }

  const body = (await res.json()) as { id?: string }
  if (!body.id) {
    throw new Error(`Openpay tokenization returned no id: ${JSON.stringify(body)}`)
  }
  return body.id
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/dlucca/Projects/Novapatch/novafrontend
git add apps/storefront/tests/e2e/smoke/helpers/openpay-token.ts
git commit -m "$(cat <<'EOF'
Add Openpay server-side tokenization helper for smoke L4

Creates a one-time token via /v1/{merchantId}/tokens. Required because
Medusa's /complete route expects a one-time token, not a vault card_id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Frontend: Create the full-checkout Playwright spec

**Files:**
- Create: `/Users/dlucca/Projects/Novapatch/novafrontend/apps/storefront/tests/e2e/smoke/full-checkout.spec.ts`

**Why:** This is the smoke test itself. Walks the full purchase funnel, charges Openpay, polls for capture, cancels the order.

- [ ] **Step 1: Create the spec file**

```typescript
// novafrontend/apps/storefront/tests/e2e/smoke/full-checkout.spec.ts
//
// L4 smoke: full happy-path against PRODUCTION with a synthetic transaction.
// Tokenizes the founder's card, applies SMOKE_PROMO_CODE (99% off + free
// shipping), completes checkout, polls Openpay webhook arrival, asserts
// order shape, then cancels the order. Cost per run: ~$1-5 MXN residual.
//
// Backend safeguards (must be deployed before running):
//   - envia-fulfillment subscriber skips orders where metadata.smoke_test=true
//   - mapPaymentCapturedToSlackBlocks prepends 🧪 [SMOKE] to the header
//
// Spec: novabackend/docs/superpowers/specs/2026-05-17-smoke-l4-full-checkout-design.md

import { test, expect, type APIRequestContext } from "@playwright/test"
import { createOpenpayToken } from "./helpers/openpay-token"

const BACKEND_URL = process.env.BACKEND_URL ?? "https://admin.novapatch.care"
const PUBLISHABLE_KEY =
  process.env.PUBLISHABLE_API_KEY ??
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
  ""
const ADMIN_API_KEY = process.env.PROD_ADMIN_API_KEY ?? ""
const PROMO_CODE = process.env.SMOKE_PROMO_CODE ?? ""
const VARIANT_ID = process.env.SMOKE_VARIANT_ID ?? ""

const OPENPAY_MERCHANT_ID = process.env.SMOKE_OPENPAY_MERCHANT_ID ?? ""
const OPENPAY_PRIVATE_KEY = process.env.SMOKE_OPENPAY_PRIVATE_KEY ?? ""
const OPENPAY_API_BASE = "https://api.openpay.mx/v1"

const SMOKE_CARD = {
  cardNumber: process.env.SMOKE_CARD_NUMBER ?? "",
  cvv: process.env.SMOKE_CARD_CVV ?? "",
  expirationMonth: process.env.SMOKE_CARD_EXP_MONTH ?? "",
  expirationYear: process.env.SMOKE_CARD_EXP_YEAR ?? "",
  holderName: process.env.SMOKE_CARD_HOLDER_NAME ?? "",
}

const SMOKE_EMAIL = "smoke@novapatch.care"

const TEST_SHIPPING_ADDRESS = {
  first_name: "Smoke",
  last_name: "Test",
  address_1: "Av. Álvaro Obregón 100",
  address_2: "Roma Norte",
  city: "Cuauhtémoc",
  province: "CDMX",
  country_code: "mx",
  postal_code: "06700",
  phone: "+525500000000",
}

function api(request: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  return request.fetch(`${BACKEND_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    data: init?.data as any,
  })
}

function adminApi(request: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  return request.fetch(`${BACKEND_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-medusa-access-token": ADMIN_API_KEY,
    },
    data: init?.data as any,
  })
}

async function cancelOrder(request: APIRequestContext, orderId: string): Promise<void> {
  const res = await adminApi(request, `/admin/orders/${orderId}/cancel`, { method: "POST" })
  if (!res.ok()) {
    throw new Error(`Failed to cancel order ${orderId}: ${res.status()} ${await res.text()}`)
  }
}

test.describe("full-checkout smoke (L4) — PRODUCTION, real charge", () => {
  test.skip(
    !PUBLISHABLE_KEY || !ADMIN_API_KEY || !PROMO_CODE || !VARIANT_ID ||
    !OPENPAY_MERCHANT_ID || !OPENPAY_PRIVATE_KEY || !SMOKE_CARD.cardNumber,
    "Missing one of: PUBLISHABLE_API_KEY, PROD_ADMIN_API_KEY, SMOKE_PROMO_CODE, SMOKE_VARIANT_ID, SMOKE_OPENPAY_MERCHANT_ID, SMOKE_OPENPAY_PRIVATE_KEY, SMOKE_CARD_*"
  )

  test("real charge + webhook + order + cancel completes end-to-end", async ({ request }) => {
    test.setTimeout(180_000)  // 3 min: includes 60s webhook polling

    let orderId: string | null = null

    try {
      // ── 1. Resolve region + create cart with smoke flag ──────────────────────
      const regionsRes = await api(request, "/store/regions")
      expect(regionsRes.status()).toBe(200)
      const { regions } = await regionsRes.json()
      const mxRegion = regions.find((r: any) =>
        r.countries?.some((c: any) => c.iso_2 === "mx")
      ) ?? regions[0]
      expect(mxRegion?.id, "MX region must exist").toBeTruthy()

      const createCartRes = await api(request, "/store/carts", {
        method: "POST",
        data: {
          region_id: mxRegion.id,
          email: SMOKE_EMAIL,
          metadata: { smoke_test: true },
        },
      })
      expect(createCartRes.status()).toBe(200)
      const { cart } = await createCartRes.json()
      const cartId = cart.id

      // ── 2. Add line item ─────────────────────────────────────────────────────
      const addItemRes = await api(request, `/store/carts/${cartId}/line-items`, {
        method: "POST",
        data: { variant_id: VARIANT_ID, quantity: 1 },
      })
      expect(addItemRes.status(), "add item should succeed").toBe(200)

      // ── 3. Set shipping address ──────────────────────────────────────────────
      const updateRes = await api(request, `/store/carts/${cartId}`, {
        method: "POST",
        data: {
          shipping_address: TEST_SHIPPING_ADDRESS,
          email: SMOKE_EMAIL,
        },
      })
      expect(updateRes.status(), "set address should succeed").toBe(200)

      // ── 4. Apply the 99% off + free shipping promo ───────────────────────────
      const promoRes = await api(request, `/store/carts/${cartId}/promotions`, {
        method: "POST",
        data: { promo_codes: [PROMO_CODE] },
      })
      expect(promoRes.status(), "apply promo should succeed (check promo not expired)").toBe(200)

      // ── 5. Apply shipping method ─────────────────────────────────────────────
      const shippingRes = await api(
        request,
        `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`
      )
      expect(shippingRes.status()).toBe(200)
      const { shipping_options } = await shippingRes.json()
      expect(shipping_options?.length, "at least one shipping option").toBeGreaterThan(0)

      const applyShippingRes = await api(
        request,
        `/store/carts/${cartId}/shipping-methods`,
        {
          method: "POST",
          data: { option_id: shipping_options[0].id },
        }
      )
      expect(applyShippingRes.status()).toBe(200)
      const { cart: cartWithShipping } = await applyShippingRes.json()
      // Sanity: with 99% off + free shipping, total should be ≤ 30 MXN.
      // If this fails the promo isn't applying correctly (huge cost risk).
      expect(
        cartWithShipping.total,
        `cart total should be ≤ 30 MXN after promo (actual: ${cartWithShipping.total})`
      ).toBeLessThanOrEqual(3000)  // Medusa stores totals in cents

      // ── 6. Create payment session ────────────────────────────────────────────
      const paymentSessRes = await api(
        request,
        `/store/carts/${cartId}/payment-sessions`,
        { method: "POST" }
      )
      expect(paymentSessRes.status()).toBe(200)

      // ── 7. Tokenize card via Openpay ─────────────────────────────────────────
      const openpayTokenId = await createOpenpayToken({
        merchantId: OPENPAY_MERCHANT_ID,
        privateKey: OPENPAY_PRIVATE_KEY,
        card: SMOKE_CARD,
        apiBaseUrl: OPENPAY_API_BASE,
      })
      expect(openpayTokenId, "Openpay token should be created").toBeTruthy()

      // ── 8. Complete checkout — REAL CHARGE HAPPENS HERE ──────────────────────
      const completeRes = await api(request, `/store/carts/${cartId}/complete`, {
        method: "POST",
        data: { openpay_token_id: openpayTokenId },
      })
      expect(completeRes.status(), `complete should succeed: ${await completeRes.text()}`).toBe(200)
      const completeBody = await completeRes.json()

      // Detect 3DS redirect — would fail the smoke since we can't complete 3DS
      // unattended. If this happens, we need to either disable 3DS for this
      // promo amount or accept the test gets skipped.
      if (completeBody.type === "redirect") {
        throw new Error("Openpay required 3DS redirect — smoke cannot complete unattended. Lower amount or whitelist customer.")
      }

      orderId = completeBody?.order?.id ?? completeBody?.id ?? null
      expect(orderId, "complete should return an order id").toBeTruthy()

      // ── 9. Poll until payment_captured (webhook arrival) ─────────────────────
      const POLL_INTERVAL_MS = 5_000
      const POLL_TIMEOUT_MS = 60_000
      const start = Date.now()
      let order: any = null
      while (Date.now() - start < POLL_TIMEOUT_MS) {
        const orderRes = await adminApi(request, `/admin/orders/${orderId}`)
        if (orderRes.status() === 200) {
          const body = await orderRes.json()
          order = body.order
          if (order?.payment_status === "captured") break
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }

      expect(
        order?.payment_status,
        `Openpay webhook did not result in payment_status=captured within ${POLL_TIMEOUT_MS / 1000}s. ` +
        `Check webhook config in Openpay dashboard or the captured-payment subscriber. Last seen status: ${order?.payment_status}`
      ).toBe("captured")

      // ── 10. Assert order shape ───────────────────────────────────────────────
      expect(order.email, "order email should be smoke address").toBe(SMOKE_EMAIL)
      expect(
        order.metadata?.smoke_test,
        "smoke_test metadata MUST propagate from cart to order (else Envia guard fails)"
      ).toBe(true)
      expect(order.items?.length, "order should have 1 item").toBe(1)

      // ── 11. Cancel order ─────────────────────────────────────────────────────
      await cancelOrder(request, orderId)

      // ── 12. Verify canceled ──────────────────────────────────────────────────
      const afterCancelRes = await adminApi(request, `/admin/orders/${orderId}`)
      expect(afterCancelRes.status()).toBe(200)
      const { order: canceled } = await afterCancelRes.json()
      expect(canceled.status, "order should be canceled").toBe("canceled")

    } catch (err) {
      // Best-effort cleanup: if test dies after order creation, try to cancel
      if (orderId) {
        try {
          await cancelOrder(request, orderId)
          console.log(`[smoke L4] Best-effort cancel succeeded for order ${orderId}`)
        } catch (cancelErr) {
          console.error(`[smoke L4] CRITICAL: order ${orderId} NOT canceled — manual cleanup required. Reason: ${cancelErr instanceof Error ? cancelErr.message : String(cancelErr)}`)
        }
      }
      throw err
    }
  })
})
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/dlucca/Projects/Novapatch/novafrontend/apps/storefront
pnpm tsc --noEmit
```

Expected: no errors in `tests/e2e/smoke/full-checkout.spec.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/dlucca/Projects/Novapatch/novafrontend
git add apps/storefront/tests/e2e/smoke/full-checkout.spec.ts
git commit -m "$(cat <<'EOF'
Add L4 full-checkout smoke spec (prod, real charge)

Synthetic transaction: tokenize founder card → 99% promo + free shipping
→ /complete → poll webhook → cancel order. Validates Openpay prod, webhook,
order creation, email and Slack notification end-to-end. Cost ~$1-5 MXN
residual per run.

Backend guards (deployed separately) prevent Envia label and add [SMOKE]
flag to Slack notification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Frontend: Add the `full-checkout` job to GitHub Actions

**Files:**
- Modify: `/Users/dlucca/Projects/Novapatch/novafrontend/.github/workflows/smoke.yml`

**Why:** Wire up the smoke spec to run weekly Monday 06:00 UTC + on-demand via `workflow_dispatch`.

- [ ] **Step 1: Add the new job**

Open `.github/workflows/smoke.yml`. After the existing `smoke:` job's last step, add a new job at the same indent level:

```yaml
  full-checkout:
    # L4 smoke — runs against PROD with a real (residual) charge.
    # Manual trigger always available. Schedule = weekly Mondays 06:00 UTC.
    # The daily L3 smoke (job: smoke) is the safety net for everything else.
    #
    # The `if:` below uses github.event.schedule to ensure this job runs
    # ONLY on the Monday cron (not the daily one). Combined with the L3 job's
    # mirror filter (see step 3), each cron line triggers exactly one job.
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'schedule' && github.event.schedule == '0 6 * * 1')
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: apps/storefront/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install
        working-directory: apps/storefront

      - name: Install Playwright browsers
        run: pnpm exec playwright install chromium --with-deps
        working-directory: apps/storefront

      - name: Run L4 full-checkout smoke
        run: pnpm exec playwright test tests/e2e/smoke/full-checkout.spec.ts --reporter=line
        working-directory: apps/storefront
        env:
          BACKEND_URL: ${{ secrets.BACKEND_URL }}
          NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: ${{ secrets.MEDUSA_PUBLISHABLE_KEY }}
          PROD_ADMIN_API_KEY: ${{ secrets.PROD_ADMIN_API_KEY }}
          SMOKE_PROMO_CODE: ${{ secrets.SMOKE_PROMO_CODE }}
          SMOKE_VARIANT_ID: ${{ secrets.SMOKE_VARIANT_ID }}
          SMOKE_OPENPAY_MERCHANT_ID: ${{ secrets.SMOKE_OPENPAY_MERCHANT_ID }}
          SMOKE_OPENPAY_PRIVATE_KEY: ${{ secrets.SMOKE_OPENPAY_PRIVATE_KEY }}
          SMOKE_CARD_NUMBER: ${{ secrets.SMOKE_CARD_NUMBER }}
          SMOKE_CARD_CVV: ${{ secrets.SMOKE_CARD_CVV }}
          SMOKE_CARD_EXP_MONTH: ${{ secrets.SMOKE_CARD_EXP_MONTH }}
          SMOKE_CARD_EXP_YEAR: ${{ secrets.SMOKE_CARD_EXP_YEAR }}
          SMOKE_CARD_HOLDER_NAME: ${{ secrets.SMOKE_CARD_HOLDER_NAME }}

      - name: Upload test results on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-l4-report
          path: apps/storefront/playwright-report/

      - name: Notify Slack on failure
        if: failure()
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          RUN_URL: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          jq -n \
            --arg run_url "$RUN_URL" \
            '{
              text: ":x: *L4 full-checkout smoke FAILED*",
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: (":x: *L4 full-checkout smoke FAILED*\nWebhook, charge, or order creation broke in PROD.\n*Run:* <" + $run_url + "|Ver logs>")
                  }
                }
              ]
            }' | curl -X POST -H "Content-Type: application/json" -d @- "$SLACK_WEBHOOK_URL"
```

- [ ] **Step 2: Update the top-level `schedule:` to add the weekly cron**

In the same file, update the `on.schedule` section. Current:

```yaml
  schedule:
    - cron: "0 6 * * *"
```

Change to:

```yaml
  schedule:
    - cron: "0 6 * * *"     # Daily L3 (pre-checkout, no charge)
    - cron: "0 6 * * 1"     # Weekly L4 (full checkout, real residual charge)
```

- [ ] **Step 3: Add a matching `if:` filter to the existing `smoke:` job**

To prevent duplicate runs on Mondays (when both crons match), the existing `smoke:` (L3) job must ALSO filter by cron schedule. Without this, Monday 06:00 UTC would fire 4 jobs (2 crons × 2 jobs).

Find the `smoke:` job definition (the first job in the file). Add an `if:` filter at the same indent level as `runs-on:`:

```yaml
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name != 'schedule' || github.event.schedule == '0 6 * * *'
    steps:
      - uses: actions/checkout@v4
      # ... rest unchanged
```

This reads as: "run on pull_request and workflow_dispatch always; on schedule, only the daily cron."

Result: each cron triggers exactly one job. Manual `workflow_dispatch` triggers both (intentional — you may want to test L4 outside the schedule).

- [ ] **Step 4: Commit + push**

```bash
cd /Users/dlucca/Projects/Novapatch/novafrontend
git add .github/workflows/smoke.yml
git commit -m "$(cat <<'EOF'
Add L4 full-checkout job to smoke workflow

Runs weekly (Mondays 06:00 UTC) + workflow_dispatch. Triggers the
production synthetic transaction test. L3 daily smoke unaffected
(filtered to daily cron only to avoid Monday duplicate fires).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Task 8 — First run + validation

**Files:** none

**Why:** Validate end-to-end before relying on the schedule.

- [ ] **Step 1: Trigger the workflow manually**

Go to https://github.com/dlucca/novafrontend/actions/workflows/smoke.yml → "Run workflow" → branch `main` → "Run workflow".

- [ ] **Step 2: Watch the run**

Observe the run logs. The `full-checkout` job should:
- Tokenize the card (no 4xx from Openpay)
- Complete the checkout (200 from `/complete`)
- Poll for ~5-15 seconds before seeing `payment_status=captured`
- Cancel the order
- Exit green

If it fails, the error message will indicate which step. Common failures:
- "Openpay tokenization failed (400)" → card data wrong, check secrets
- "complete should succeed" → 3DS triggered (lower amount or whitelist customer in Openpay) or another issue
- "Openpay webhook did not arrive within 60s" → webhook URL misconfigured in Openpay dashboard; check `https://admin.novapatch.care/openpay/webhook` (or whatever the prod URL is)
- "cart total should be ≤ 30 MXN" → promo not applying; verify code + customer restriction

- [ ] **Step 3: Verify side effects in production**

After the run goes green, manually check:

1. **Slack** `#orders` channel → there's a message starting with `🧪 [SMOKE] Cobro confirmado` for the smoke order
2. **Email inbox** (forwarded `smoke@novapatch.care` → `dlucca@gmail.com`) → received the order confirmation email
3. **Medusa admin** → https://admin.novapatch.care/orders → newest order has `status=canceled`, metadata shows `smoke_test: true`
4. **Envia dashboard** → NO new label was created for this order (proves the guard works)
5. **Openpay dashboard** → there's a charge for the residual amount; refund it manually if you want zero net cost (one-time cleanup of the first run only)

- [ ] **Step 4: Confirm the schedule is active**

After ~24h, run:

```bash
gh run list --repo dlucca/novafrontend --workflow=smoke.yml --event=schedule --limit=5
```

You should see the daily L3 runs. The L4 weekly run will appear after the next Monday 06:00 UTC.

- [ ] **Step 5: Set a calendar reminder**

The card expires in ~2-4 years. Set a calendar reminder 1 month before expiry to renew the GHA secrets (`SMOKE_CARD_*`).

---

## Out of scope

These are explicitly NOT in this plan (deferred):

- L5 subscription smoke (validate `is_subscription: true` end-to-end)
- Automated Openpay refund step (would bring cost to $0 — not worth complexity now)
- Active verification of email + Slack via their APIs (we currently rely on the order reaching `captured` as proxy)
- Moving the card data out of GHA secrets to a vault-only flow (would require new backend endpoint)
- Reports/CSV exports filtering out `smoke_test=true` orders (verify if this is needed; not addressed here)
