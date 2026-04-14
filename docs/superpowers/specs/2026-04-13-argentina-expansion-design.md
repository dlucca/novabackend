# Argentina Expansion — Design Spec

**Date:** 2026-04-13  
**Status:** Approved  
**Branch prefix:** `feat/argentina-expansion`

---

## Overview

Activate Argentina as a second e-commerce region in Novapatch. The work is split into three independent, sequentially deployable stages. Mexico remains untouched throughout.

---

## Stage 1 — Argentina Region + ARS Prices

**Branch:** `feat/argentina-etapa1-region`

### Goal
Make Argentina a valid Medusa region with ARS pricing on all 24 SKUs. The frontend can display ARS prices and create carts in the AR region. No real payment gateway yet — uses `pp_system_default` temporarily.

### Pricing
Base price: **$60,000 ARS** (IVA included).

| Plan      | Discount | ARS Price  |
|-----------|----------|------------|
| Once      | 0%       | $60,000    |
| Monthly   | 20%      | $48,000    |
| Bimonthly | 15%      | $51,000    |
| Quarterly | 10%      | $54,000    |

### Changes

**`src/scripts/seed-argentina.ts`** — new standalone idempotent script:
- Adds `ars` to store `supported_currencies`
- Creates Argentina region (`currency_code: "ars"`, `countries: ["ar"]`, `payment_providers: ["pp_system_default"]`)
- Adds ARS prices to all 24 existing variants (6 products × 4 tiers)
- Idempotent: checks for existing region/prices before creating
- Does NOT touch MX data

**`seed-novapatch.ts`** — no changes needed; seed-argentina.ts runs independently.

### What does NOT change
- Openpay module
- Billing cron
- Subscription logic
- Shipping (flat fee handled by frontend)

### How to run
```bash
npx medusa exec ./src/scripts/seed-argentina.ts
```

---

## Stage 2 — MercadoPago Payment Module

**Branch:** `feat/argentina-etapa2-mercadopago`

### Goal
Custom Medusa payment provider for MercadoPago. Mirrors the existing Openpay module architecture. Enables card tokenization and server-to-server charges for AR customers.

### Payment Flow (triangular, PCI-DSS compliant)
```
Browser → MP SDK:   cardData → card_token       (client-side tokenization)
Browser → Medusa:   card_token + device_session_id
Medusa  → MP API:   server-to-server charge with card_token
```

Card data never touches Novapatch servers.

### File Structure
```
src/modules/mercadopago-payment/
├── index.ts                              # MERCADOPAGO_MODULE = "mercadopagoPaymentService"
├── mercadopago-client.ts                 # REST API wrapper
├── service.ts                            # AbstractPaymentProvider implementation
└── __tests__/
    ├── mercadopago-client.unit.spec.ts
    └── mercadopago-payment-service.unit.spec.ts
```

### `mercadopago-client.ts`
Wraps MP REST API. Methods:
- `createCustomer(email, name)` → creates customer in MP vault
- `getOrCreateCustomer(email, name)` → idempotent vault sync
- `createCard(customerId, cardToken)` → saves tokenized card to customer vault
- `charge(customerId, cardId, amount, currencyCode, description)` → server-to-server charge
- `getCards(customerId)` → list saved cards

### `service.ts`
Extends `AbstractPaymentProvider<Options>`. Options: `{ accessToken, sandbox }`.

- `initiatePayment` → returns `{ data: { status: "pending" } }`
- `updatePayment` → passes through `mp_card_token` + `device_session_id` into session data
- `authorizePayment` → syncs MP customer vault (stores `mp_customer_id` in customer metadata), charges card, returns authorized/error status
- `capturePayment` → no-op (MP charges are capture-on-authorize)
- `getPaymentStatus` → maps MP charge status to Medusa PaymentSessionStatus

Customer vault ID stored as `customer.metadata.mp_customer_id` (parallel to existing `openpay_customer_id`).

### Config (`medusa-config.ts`)
```ts
{
  resolve: "./src/modules/mercadopago-payment",
  options: {
    accessToken: process.env.MP_ACCESS_TOKEN,
    sandbox: process.env.NODE_ENV !== "production",
  },
}
```

### Argentina Region Update
After this stage, run a one-off script (`src/scripts/update-ar-payment-provider.ts`) to update the AR region's payment provider from `pp_system_default` to `pp_mercadopago`. This makes the change reproducible and auditable.

### Affected Endpoints
- `POST /store/carts/:id/payment-sessions` — works as-is, Medusa routes by region
- `POST /store/carts/:id/complete` — receives `mp_card_token` instead of `openpay_token_id`
- `GET /store/me/payment-methods` — needs provider routing (see Stage 3)

### New Env Vars
```
MP_ACCESS_TOKEN=       # MercadoPago access token (sandbox or production)
```

---

## Stage 3 — Multi-Region Billing

**Branch:** `feat/argentina-etapa3-billing-multiregion`

### Goal
Make `processBillingCycle` and `processDailySubscriptions` provider-agnostic. Each subscription is charged via the correct gateway based on its original order's payment provider.

### Provider Resolution Strategy
Rather than adding a migration to the Subscription model, resolve the provider at runtime from the original order:

```
subscription.original_order_id
  → order.payment_collections[0].payment_sessions[0].provider_id
  → "pp_openpay" | "pp_mercadopago"
```

This avoids a schema migration. If this lookup proves fragile, a follow-up migration can add `payment_provider_id` directly to the `Subscription` model.

### Changes to `processBillingCycle`

New step: **`resolve-payment-provider`**
- Reads `original_order_id` from subscription
- Queries order's payment collections to extract `provider_id`
- Returns provider identifier

Updated step: **`process-billing`**
- Receives `provider_id` as explicit parameter
- Selects correct client (Openpay vs MercadoPago) via a `PaymentProviderRouter` helper
- Charges using the appropriate client's `chargeSubscription(customerId, amount, currency)` interface

### `PaymentProviderRouter`
A simple internal utility (not a Medusa module):
```ts
// src/lib/payment-provider-router.ts
getChargeClient(providerId: string, container: MedusaContainer): ChargeClient
```
Returns a unified `ChargeClient` interface implemented by both Openpay and MercadoPago clients.

### Cron Schedule
Change from `0 6 * * *` (midnight CST / UTC-6) to `0 3 * * *` (midnight ART / UTC-3).

- Argentina: 00:00 ART ✓
- Mexico: 21:00 CST previous day — acceptable for subscription billing

### `GET /store/me/payment-methods` Update
Requires `region_id` as a query param. Returns 400 if missing.
- AR region ID → query MP vault (`mp_customer_id`)
- MX region ID → query Openpay vault (`openpay_customer_id`)

### What does NOT change
- Subscription model schema (no migration)
- Email subscribers
- Slack notifications
- Envia fulfillment

---

## Sequencing & Dependencies

```
Stage 1 (region + prices)
    ↓
Stage 2 (MercadoPago module)   ← depends on Stage 1 for AR region to assign provider
    ↓
Stage 3 (billing multi-region) ← depends on Stage 2 for MP charge client
```

Each stage is independently deployable. Stage 1 can go to production immediately with `pp_system_default` while Stage 2 is built.

---

## Out of Scope

- Shipping integration (flat fee handled by frontend)
- Admin extension updates for AR-specific views
- Dynamic ARS pricing / FX rate conversion
- Other regions (Brazil, Colombia, Chile) — separate specs
