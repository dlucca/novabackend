# MX Shipping Rate Shopping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the $85 flat shipping on /mx checkout with two zone-based flat rates ($90 CDMX/Edo. México, $145 Nacional), update the Envía rate-shopping carrier pool to the 6 approved carriers, and surface the estimated delivery window to the customer both on the checkout success screen and the order confirmation email.

**Architecture:** The backend already does parallel-carrier rate shopping in `generate-envia-label`; we update the carrier list and propagate the chosen ETA onto `order.metadata`. The customer-facing ETA on checkout completion and in the order confirmation email is zone-based (computed from the shipping address state) because the Envía label is generated asynchronously after `order.placed` fires — by the time the customer sees the confirmation, Envía's `deliveryEstimate` is not yet available. The carrier-specific ETA lives in `order.metadata.envia_eta` and can be surfaced later in the "shipped" email.

**Tech Stack:** Medusa v2 workflows (`workflows-sdk`), Jest unit tests, React Email templates via Resend, Next.js 15 App Router storefront.

---

## Pre-requisites and scope

- **Scope: México only.** No code runs against `cartRegion === "ars"`.
- Backend rate-shopping already exists in `src/workflows/envia-create-fulfillment/steps/generate-label.ts`. We will edit its carrier pool and its step output, not rewrite it.
- Medusa admin configuration (service zones + two shipping options) is performed manually in Task 0 below. It is a prerequisite for the frontend to receive the correct price from `/store/shipping-options`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/workflows/envia-create-fulfillment/steps/generate-label.ts` | Modify | Switch carrier pool, return chosen rate's `deliveryEstimate` alongside the shipment |
| `src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts` | Modify | Accept the ETA, write `envia_*` keys onto order metadata |
| `src/workflows/envia-create-fulfillment/index.ts` | Modify | Thread new step output from generate-label → create-fulfillment |
| `src/lib/shipping-eta.ts` | Create | Pure function mapping shipping address state → zone ETA label |
| `src/lib/__tests__/shipping-eta.unit.spec.ts` | Create | Unit tests for ETA resolver |
| `src/emails/OrderConfirmation.tsx` | Modify | Render `estimatedDelivery` prop |
| `src/subscribers/order-confirmation-email.ts` | Modify | Compute zone ETA from shipping address and pass to template |
| `apps/storefront/app/[locale]/checkout/page.tsx` | Modify | Remove hardcoded `85` fallbacks; read shipping amount from Medusa response |
| `apps/storefront/app/[locale]/checkout/page.tsx` | Modify | On success screen, render zone-based ETA string |
| `apps/storefront/lib/shipping-eta.ts` | Create | Mirrors backend ETA resolver (client-safe copy, no imports needed) |

---

### Task 0: Medusa admin configuration (manual — user executes)

**Files:** None. This is Medusa admin UI setup, not code.

**Execute these steps in the Medusa admin** against **production only** — staging is not required:

- [ ] **Step 1: Create two service zones under the MX location**

1. Medusa Admin → Settings → Locations → Novapatch Warehouse MX → Shipping → *Create service zone*
2. First zone:
   - Name: `CDMX + Estado de México`
   - Geo zones: add two rules — `country_code = MX, province_code = DIF` and `country_code = MX, province_code = MEX` (use whatever province codes appear in your existing customer data — confirm in an existing MX order's `shipping_address.province_code`)
3. Second zone:
   - Name: `Nacional (resto de México)`
   - Geo zones: `country_code = MX` (no province — this acts as the catch-all)

**Ordering matters:** Medusa evaluates zones top-to-bottom on the `getShippingOptions` endpoint. The CDMX+EdoMex zone must be listed above Nacional or every cart will match Nacional first.

- [ ] **Step 2: Create a shipping option in each zone**

Inside the `CDMX + Estado de México` zone → Add shipping option:
- Name: `Estándar CDMX / Edo. México`
- Shipping profile: Default
- Fulfillment provider: Manual
- Type: Estándar (existing type)
- Price: `90.00` MXN (flat)

Inside the `Nacional (resto de México)` zone → Add shipping option:
- Name: `Estándar Nacional`
- Shipping profile: Default
- Fulfillment provider: Manual
- Type: Estándar
- Price: `145.00` MXN (flat)

- [ ] **Step 3: Disable or delete the old `$85` shipping option**

Find the existing `Standard` shipping option (the one the storefront has been hitting). Either:
- Delete it, or
- Set its price to `0` and keep it unpublished, or
- Move it to an unreachable zone

Verify: `curl "$MEDUSA/store/shipping-options?cart_id=<cdmx_cart>" -H "x-publishable-api-key: <key>"` returns only the `$90` option; same call for a Nacional cart returns only the `$145` option.

- [ ] **Step 4: Manually QA one cart per zone**

Create a test cart for a CDMX postal code → verify price $90. Create a test cart for a Guadalajara postal code → verify price $145. Do not proceed past this task until both work.

---

### Task 1: Swap the Envía carrier pool

**Files:**
- Modify: `src/workflows/envia-create-fulfillment/steps/generate-label.ts:26`

- [ ] **Step 1: Read the current default**

Open `src/workflows/envia-create-fulfillment/steps/generate-label.ts`. Locate line 26:

```ts
const DEFAULT_CARRIERS = ["noventa9minutos", "ups", "dhl", "fedex", "estafeta"]
```

- [ ] **Step 2: Replace with the approved pool**

```ts
const DEFAULT_CARRIERS = ["paquetexpress", "sendex", "ampm", "estafeta", "dhl", "fedex"]
```

Also update the comment block above it (lines 18–26) so future maintainers understand the change:

```ts
// Carriers to quote in parallel. The Envia API requires one carrier per request.
// Override via ENVIA_CARRIERS env var (comma-separated) to change without redeploying.
//
// Approved carrier pool for Novapatch MX (2026-04):
//   paquetexpress, sendex, ampm, estafeta, dhl, fedex
//
// Note: paquetexpress historically required a colonia field. Our mapAddress() already
// sends it from the shipping address metadata, so this carrier should now respond.
const DEFAULT_CARRIERS = ["paquetexpress", "sendex", "ampm", "estafeta", "dhl", "fedex"]
```

- [ ] **Step 3: Commit**

```bash
git add src/workflows/envia-create-fulfillment/steps/generate-label.ts
git commit -m "feat(envia): update carrier pool to paquetexpress/sendex/ampm/estafeta/dhl/fedex"
```

---

### Task 2: Return the chosen rate's ETA from the label step

**Files:**
- Modify: `src/workflows/envia-create-fulfillment/steps/generate-label.ts`

The step currently returns just `shipment: EnviaGenerateResult`. We want downstream steps to see the `deliveryEstimate` string of the *chosen* rate (the rate whose label succeeded), so we return it alongside.

- [ ] **Step 1: Add a test for the new shape**

Open (or create if missing) `src/workflows/envia-create-fulfillment/__tests__/generate-label.unit.spec.ts`. Add this case next to existing tests:

```ts
it("returns deliveryEstimate from the winning rate alongside the shipment", async () => {
  const fakeRates = [
    { carrier: "ampm", service: "express", totalPrice: "80.00", currency: "MXN", deliveryEstimate: "2-3 días hábiles", serviceDescription: "AMPM Express" },
    { carrier: "dhl", service: "ground", totalPrice: "120.00", currency: "MXN", deliveryEstimate: "3-4 días hábiles", serviceDescription: "DHL Ground" },
  ]
  const fakeShipment = { carrier: "ampm", service: "express", shipmentId: 1, trackingNumber: "T1", trackUrl: "u", label: "l", totalPrice: 80, currency: "MXN" }

  const client = {
    getRate: jest.fn().mockImplementation(({ shipment: { carrier } }) => Promise.resolve(fakeRates.find((r) => r.carrier === carrier) ?? null)),
    generateShipment: jest.fn().mockResolvedValue(fakeShipment),
  }

  // Inject via the existing test harness (see sibling specs for the pattern)
  const output = await runStep({ order: fakeOrder, client })

  expect(output).toEqual({
    shipment: fakeShipment,
    deliveryEstimate: "2-3 días hábiles",
    quotedCarrierCost: "80.00",
  })
})
```

If no existing `generate-label` spec exists, model it on the pattern in `src/workflows/envia-create-fulfillment/__tests__/` (adjacent specs may already mock `EnviaClient`).

- [ ] **Step 2: Run the test and see it fail**

```bash
npx jest --testPathPattern=generate-label
```

Expected: FAIL with "Expected: {...} Received: {carrier, service, shipmentId, ...}" — the step currently returns just the shipment.

- [ ] **Step 3: Track the winning rate inside the existing loop**

In `generate-label.ts`, inside the `for (const rate of sortedRates)` loop around line 93, after the successful `generateShipment` call, capture the rate:

```ts
let shipment: EnviaGenerateResult | null = null
let winningRate: EnviaRateResult | null = null  // ← new

for (const rate of sortedRates) {
  try {
    // ... existing code ...
    shipment = await client.generateShipment(...)
    winningRate = rate  // ← new
    // ... existing logs ...
    break
  } catch (err: any) {
    // ... existing fallback logic unchanged ...
  }
}

if (!shipment) {
  throw new Error(`All carriers failed label generation for order ${order.id}`)
}
```

- [ ] **Step 4: Change the step return shape**

Right before `return new StepResponse(shipment, compensationData)`:

```ts
const output = {
  shipment,
  deliveryEstimate: winningRate?.deliveryEstimate ?? "",
  quotedCarrierCost: winningRate?.totalPrice ?? String(shipment.totalPrice),
}

return new StepResponse(output, compensationData)
```

- [ ] **Step 5: Run the test and see it pass**

```bash
npx jest --testPathPattern=generate-label
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workflows/envia-create-fulfillment/steps/generate-label.ts src/workflows/envia-create-fulfillment/__tests__/generate-label.unit.spec.ts
git commit -m "feat(envia): return winning rate deliveryEstimate from generate-envia-label step"
```

---

### Task 3: Propagate ETA to order.metadata via the fulfillment step

**Files:**
- Modify: `src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts`
- Modify: `src/workflows/envia-create-fulfillment/index.ts`

The create-medusa-fulfillment step today writes to `fulfillment.metadata` but not to `order.metadata`. We want the email and frontend to read `order.metadata.envia_eta` etc., so we add an order update.

- [ ] **Step 1: Write a test for the order metadata update**

Open `src/workflows/envia-create-fulfillment/__tests__/create-fulfillment.unit.spec.ts` (create if missing). Add:

```ts
it("writes envia_carrier, envia_service, envia_eta, envia_carrier_cost onto order.metadata", async () => {
  const orderService = { updateOrders: jest.fn().mockResolvedValue(undefined) }
  const shipment = { carrier: "ampm", service: "express", shipmentId: 1, trackingNumber: "T1", trackUrl: "u", label: "l", totalPrice: 80, currency: "MXN" }

  await runStep({
    order: { id: "order_01", items: [{ id: "i1", quantity: 1 }] },
    shipment,
    deliveryEstimate: "2-3 días hábiles",
    quotedCarrierCost: "80.00",
    container: { resolve: (key: string) => (key === "logger" ? console : orderService) },
  })

  expect(orderService.updateOrders).toHaveBeenCalledWith("order_01", {
    metadata: expect.objectContaining({
      envia_carrier: "ampm",
      envia_service: "express",
      envia_eta: "2-3 días hábiles",
      envia_carrier_cost: "80.00",
      envia_currency: "MXN",
    }),
  })
})
```

- [ ] **Step 2: Run the test and see it fail**

```bash
npx jest --testPathPattern=create-fulfillment
```

Expected: FAIL — the step does not currently resolve an ORDER service or call updateOrders.

- [ ] **Step 3: Update the step signature and implementation**

In `create-fulfillment.ts`, change the step input and add an order metadata update. Current signature:

```ts
async ({ order, shipment }: { order: any; shipment: EnviaGenerateResult }, { container }) => {
```

Change to:

```ts
async (
  {
    order,
    shipment,
    deliveryEstimate,
    quotedCarrierCost,
  }: {
    order: any
    shipment: EnviaGenerateResult
    deliveryEstimate: string
    quotedCarrierCost: string
  },
  { container }
) => {
```

And near the bottom of the step, after the Medusa fulfillment + shipment creation succeed, add:

```ts
try {
  const orderService = container.resolve("order") as { updateOrders: (id: string, update: any) => Promise<unknown> }
  await orderService.updateOrders(order.id, {
    metadata: {
      ...(order.metadata ?? {}),
      envia_carrier: shipment.carrier,
      envia_service: shipment.service,
      envia_eta: deliveryEstimate,
      envia_carrier_cost: quotedCarrierCost,
      envia_currency: shipment.currency,
      envia_shipment_id: String(shipment.shipmentId),
      envia_track_url: shipment.trackUrl,
      envia_label_url: shipment.label,
    },
  })
  logger.info(`[envia-create-fulfillment] order.metadata updated with envia_eta="${deliveryEstimate}"`)
} catch (updErr) {
  logger.warn(
    `[envia-create-fulfillment] Failed to update order.metadata — label created, but order lacks envia_eta for emails: ${
      updErr instanceof Error ? updErr.message : String(updErr)
    }`
  )
}
```

The order update is non-blocking: if it fails, the label still exists and the customer still gets confirmation — only the email loses its ETA.

- [ ] **Step 4: Wire the new inputs in the workflow composer**

Open `src/workflows/envia-create-fulfillment/index.ts` and locate the `.run()` or `.transform()` that feeds the label output into `createMedusaFulfillmentStep`. Update it to destructure the three fields:

Before (roughly):

```ts
const fulfillmentId = createMedusaFulfillmentStep({ order, shipment })
```

After:

```ts
const fulfillmentId = createMedusaFulfillmentStep({
  order,
  shipment: label.shipment,
  deliveryEstimate: label.deliveryEstimate,
  quotedCarrierCost: label.quotedCarrierCost,
})
```

If the existing code accesses the result differently (e.g., `shipment: labelOutput`), adjust references accordingly — the key insight is that `generate-label` now returns `{ shipment, deliveryEstimate, quotedCarrierCost }`.

- [ ] **Step 5: Run the test suite**

```bash
npx jest --testPathPattern=envia-create-fulfillment
```

Expected: all tests PASS (including any existing ones that need to be updated to pass the new fields).

- [ ] **Step 6: Commit**

```bash
git add src/workflows/envia-create-fulfillment/
git commit -m "feat(envia): persist envia_eta + carrier info onto order.metadata"
```

---

### Task 4: Shared zone-ETA resolver (backend)

**Files:**
- Create: `src/lib/shipping-eta.ts`
- Create: `src/lib/__tests__/shipping-eta.unit.spec.ts`

Customers see ETA before Envía runs, so we need a zone-based string computed from the shipping address state.

- [ ] **Step 1: Write failing tests first**

Create `src/lib/__tests__/shipping-eta.unit.spec.ts`:

```ts
import { resolveShippingEta } from "../shipping-eta"

describe("resolveShippingEta", () => {
  it("returns the CDMX/EdoMex window for CDMX province", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "Ciudad de México" })).toBe("2-3 días hábiles")
  })

  it("returns the CDMX/EdoMex window for Estado de México", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "Estado de México" })).toBe("2-3 días hábiles")
  })

  it("returns the national window for Jalisco", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "Jalisco" })).toBe("3-5 días hábiles")
  })

  it("returns the national window when the province is missing", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "" })).toBe("3-5 días hábiles")
  })

  it("returns an empty string for non-MX addresses", () => {
    expect(resolveShippingEta({ country_code: "ar", province: "Buenos Aires" })).toBe("")
  })

  it("is case- and accent-insensitive on province name", () => {
    expect(resolveShippingEta({ country_code: "MX", province: "CIUDAD DE MEXICO" })).toBe("2-3 días hábiles")
    expect(resolveShippingEta({ country_code: "mx", province: "estado de mexico" })).toBe("2-3 días hábiles")
  })
})
```

- [ ] **Step 2: Run to see it fail**

```bash
npx jest --testPathPattern=shipping-eta
```

Expected: FAIL with "Cannot find module '../shipping-eta'".

- [ ] **Step 3: Implement the resolver**

Create `src/lib/shipping-eta.ts`:

```ts
// Returns the customer-facing ETA string for a shipping address.
// Used by the confirmation email and the checkout success screen.
//
// We intentionally derive this from the shipping address state (zone),
// NOT from Envia's deliveryEstimate, because the label is generated
// asynchronously after order.placed — the customer needs an immediate
// answer at checkout.

const CDMX_ALIASES = ["cdmx", "ciudad de mexico", "distrito federal", "df", "mexico city"]
const EDOMEX_ALIASES = ["estado de mexico", "mexico", "edo. mex.", "edomex", "edo de mexico"]

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .trim()
}

export function resolveShippingEta(address: { country_code?: string | null; province?: string | null }): string {
  const country = (address.country_code ?? "").toLowerCase()
  if (country !== "mx") return ""

  const province = normalize(address.province ?? "")
  if (!province) return "3-5 días hábiles"

  if (CDMX_ALIASES.includes(province) || EDOMEX_ALIASES.includes(province)) {
    return "2-3 días hábiles"
  }

  return "3-5 días hábiles"
}
```

- [ ] **Step 4: Run the tests to confirm PASS**

```bash
npx jest --testPathPattern=shipping-eta
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shipping-eta.ts src/lib/__tests__/shipping-eta.unit.spec.ts
git commit -m "feat(shipping): add zone-based ETA resolver for MX addresses"
```

---

### Task 5: Show ETA in the OrderConfirmation email

**Files:**
- Modify: `src/emails/OrderConfirmation.tsx`
- Modify: `src/subscribers/order-confirmation-email.ts`

- [ ] **Step 1: Add an `estimatedDelivery` prop to the React Email template**

Open `src/emails/OrderConfirmation.tsx`. Find the component's props interface and add:

```tsx
type OrderConfirmationProps = {
  name: string
  displayId: string
  items: Array<{ title: string; quantity: number; unit_price: number; metadata?: Record<string, unknown> }>
  shippingAddress: Record<string, unknown> | null
  currencyCode: string
  estimatedDelivery?: string  // ← new, optional so existing call sites don't break
}
```

Somewhere in the body where the shipping address is rendered (or below the totals), add a conditional paragraph:

```tsx
{estimatedDelivery && (
  <p style={{ fontSize: 14, color: "#425066", margin: "12px 0" }}>
    Envío estimado: <strong style={{ color: "#0D1B35" }}>{estimatedDelivery}</strong>.{" "}
    Te enviaremos la guía por email en las próximas 24 horas.
  </p>
)}
```

Use whichever styling tokens already exist in the template — do not introduce new colors.

- [ ] **Step 2: Update the subscriber to compute and pass the ETA**

Open `src/subscribers/order-confirmation-email.ts`. Import the resolver:

```ts
import { resolveShippingEta } from "../lib/shipping-eta"
```

Inside the handler, after `const name = ...`:

```ts
const estimatedDelivery = resolveShippingEta({
  country_code: order.shipping_address?.country_code ?? null,
  province: order.shipping_address?.province ?? null,
})
```

Pass it into the template:

```ts
const html = await renderEmail(
  React.createElement(OrderConfirmation, {
    name,
    displayId,
    items: /* existing */,
    shippingAddress: order.shipping_address ?? null,
    currencyCode: order.currency_code ?? "mxn",
    estimatedDelivery,  // ← new
  })
)
```

- [ ] **Step 3: Build to catch type errors**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Render a snapshot email locally if tooling exists**

If `renderEmail` has a standalone script (check `src/emails/` or `scripts/`), run it once to verify the layout. Otherwise, rely on a production test send after deploy.

- [ ] **Step 5: Commit**

```bash
git add src/emails/OrderConfirmation.tsx src/subscribers/order-confirmation-email.ts
git commit -m "feat(email): show zone-based estimated delivery in order confirmation"
```

---

### Task 6: Frontend — drop the hardcoded `$85` and surface ETA on success

**Files:**
- Modify: `apps/storefront/app/[locale]/checkout/page.tsx`
- Create: `apps/storefront/lib/shipping-eta.ts`

**Note:** The backend Medusa shipping option already returns the correct $90 / $145 amount via `getShippingOptions(cartId)`. The checkout hardcodes `85` in two defensive fallbacks and a few totals calculations; we remove those.

- [ ] **Step 1: Mirror the ETA resolver on the client**

Create `apps/storefront/lib/shipping-eta.ts` (verbatim copy of the backend file — the logic is tiny and duplicating avoids pulling the backend package into the storefront build):

```ts
const CDMX_ALIASES = ["cdmx", "ciudad de mexico", "distrito federal", "df", "mexico city"]
const EDOMEX_ALIASES = ["estado de mexico", "mexico", "edo. mex.", "edomex", "edo de mexico"]

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

export function resolveShippingEta(address: { country_code?: string | null; province?: string | null }): string {
  const country = (address.country_code ?? "").toLowerCase()
  if (country !== "mx") return ""

  const province = normalize(address.province ?? "")
  if (!province) return "3-5 días hábiles"

  if (CDMX_ALIASES.includes(province) || EDOMEX_ALIASES.includes(province)) {
    return "2-3 días hábiles"
  }

  return "3-5 días hábiles"
}
```

- [ ] **Step 2: Find and remove the `85` hardcodes in checkout**

Open `apps/storefront/app/[locale]/checkout/page.tsx`. There are three call sites:

**Line ~459 (tracking event):**
```ts
cart_total: finalTotal + 85, // frontend estimate at fire time; preload may update finalTotal later
```
Change to:
```ts
cart_total: finalTotal + shippingCost, // shippingCost is the amount the chosen shipping option returned
```

**Line ~616 (charged total):**
```ts
let chargedTotal = finalTotal + 85;
```
Change to:
```ts
let chargedTotal = finalTotal + shippingCost;
```

You'll need a `shippingCost` variable derived from the cart's applied shipping method. After `addShippingMethod` succeeds, read it off the returned cart:

```ts
const shippedCart = await medusa.cart.addShippingMethod(cart_id!, shippingOptions[0].id);
const shippingCost = shippedCart.shipping_methods?.[0]?.amount ?? shippedCart.shipping_total ?? 0;
chargedTotal = shippedCart.total;
```

If `shippingCost` is already surfaced via `shippedCart.shipping_total`, use that directly. Any place `85` appears in a UI string (e.g., `"+$85 MXN"`) should likewise read the amount from state.

Grep to confirm you caught everything:

```bash
grep -n " 85\b" apps/storefront/app/\[locale\]/checkout/page.tsx
```

Review each hit and replace where it's a shipping-cost literal. Leave unrelated `85`s alone.

- [ ] **Step 3: Show the ETA on the checkout success state**

In the same file, locate the success state rendering (search for `CheckCircle2` or `Pedido confirmado` near line 277). Add a paragraph after the confirmation message:

```tsx
import { resolveShippingEta } from "@/lib/shipping-eta"

// inside the success block:
{(() => {
  const eta = resolveShippingEta({
    country_code: confirmedAddress?.country_code ?? "mx",
    province: confirmedAddress?.province ?? "",
  })
  if (!eta) return null
  return (
    <p className="mt-4 text-[14px] text-[#425066]">
      Envío estimado: <span className="font-bold text-[#0D1B35]">{eta}</span>.
      <br />
      Te enviaremos la guía por email en las próximas 24 horas.
    </p>
  )
})()}
```

`confirmedAddress` is the object the checkout already has post-submission. If the success screen doesn't have state access to the submitted address, read it from `cart.shipping_address` at the moment of success (whichever the existing code uses).

- [ ] **Step 4: Typecheck**

```bash
cd apps/storefront && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run the app locally (or deploy to preview). Perform a checkout with:
1. A CDMX postal code → success screen must show "2-3 días hábiles"; cart total must reflect $90 shipping, not $85.
2. A Jalisco postal code → success screen must show "3-5 días hábiles"; cart total must reflect $145.

- [ ] **Step 6: Commit**

```bash
cd ../..  # back to novafrontend root
git add apps/storefront/lib/shipping-eta.ts apps/storefront/app/\[locale\]/checkout/page.tsx
git commit -m "feat(checkout/mx): drop \$85 hardcode and surface zone ETA on success"
```

---

### Task 7: End-to-end verification

**Files:** None (manual verification).

- [ ] **Step 1: Deploy backend to Railway production**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
git push origin main
```

Wait until Railway reports the new deploy as Current.

- [ ] **Step 2: Deploy frontend to Vercel production**

```bash
cd /Users/dlucca/Projects/Novapatch/novafrontend
git push origin main
```

Wait until Vercel reports the new deploy as Current. Redeploy without build cache if env changes were made.

- [ ] **Step 3: Place a real test order for each zone**

1. CDMX address: buy 1 product → confirm cart shows $90 shipping → complete Openpay charge → confirmation screen shows "2-3 días hábiles" → confirmation email arrives with the same string.
2. National address (e.g. Monterrey): same flow → $145 shipping → "3-5 días hábiles" in both screen and email.

- [ ] **Step 4: Verify order metadata in Medusa admin**

Open each test order in the Medusa admin. In the JSON / metadata view, confirm these keys exist:
- `envia_carrier` (one of paquetexpress, sendex, ampm, estafeta, dhl, fedex)
- `envia_service`
- `envia_eta` (the Envía-reported `deliveryEstimate`, which may differ from the zone-based string shown to the customer — this is expected)
- `envia_carrier_cost` (the quoted price we paid)

- [ ] **Step 5: Check Railway logs for the winning carrier**

In Railway production logs, filter for `[envia-create-fulfillment] Label generated` — you should see one log per test order, showing the carrier Envía billed.

- [ ] **Step 6: Check margin**

For each test order: `(90 or 145) - envia_carrier_cost` is our shipping margin. If any order lost money (negative margin), log it for the operator — we may need a third "Extremo" zone in the future. This verification is manual today; a future task could automate margin alerts.

---

## Self-review

**Spec coverage:**
- Zones + flat rates → Task 0 (admin) + Task 6 (remove hardcode).
- Carrier pool updated → Task 1.
- Rate shopping preserved (already existed) → noted in architecture, validated in Task 7.
- ETA in confirmation email → Tasks 4 + 5.
- ETA on success screen → Task 6.
- `order.metadata.envia_*` persistence → Task 3.
- Fallback on Envía failure → behavior preserved from existing code; Task 1 does not weaken it.
- Observability → existing logs cover it; Task 7 verifies manually.
- Rollback → each task is an independent commit; `git revert` any one safely.

**Placeholders / TBDs:**
- Task 2 references `runStep` as a test harness; if no such helper exists in the repo, the engineer should model the spec on the nearest existing `generate-label` or `create-fulfillment` test (I checked `src/workflows/envia-create-fulfillment/__tests__/` but did not read every file). This is a known sharp edge.
- Task 0 Step 1 asks the engineer to look up an actual MX `province_code`; this cannot be hardcoded in the plan because the exact codes depend on how Novapatch has customers stored them (`DIF` vs `CDMX` vs `CIUDAD DE MEXICO`). The plan explicitly surfaces this.

**Type consistency:**
- Step output `{ shipment, deliveryEstimate, quotedCarrierCost }` is used in Tasks 2, 3 identically.
- `resolveShippingEta` signature is the same in backend and frontend copies.
- `envia_eta` key name is consistent across Task 3 (metadata write), Task 5 (email read via subscriber), Task 6 (not touched — frontend uses its own resolver).

No issues found that weren't already called out in the relevant task.

---
