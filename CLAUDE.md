# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Novapatch backend — headless e-commerce engine for a vitamin-patch subscription platform targeting Mexico (multi-region expansion planned: Brazil, Argentina, Colombia, Chile). Built on **Medusa.js v2** with PostgreSQL and Redis. This is a fresh project — code is being built from the PRD.

## Reference Documents

- `Documento de Requisitos de Producto.docx` — backend PRD (data model, endpoints, integrations, cron jobs)
- `READMEFrontend.md` — complete frontend documentation with the API contract this backend must fulfill

## Stack

- **Framework**: Medusa.js v2 (Node.js / TypeScript)
- **Database**: PostgreSQL
- **Cache & Job Queues**: Redis (cart state, cron jobs)
- **API**: REST (headless, base URL `http://localhost:9000`)
- **Auth**: Clerk (middleware validates JWT Bearer on `/store/me/*` routes, injects customer context)
- **Payments**: Openpay (Mexico — tokenized cards `tok_XXX`, server-to-server recurring charges)
- **Transactional Email**: Resend (via Medusa Event Bus, React Email templates)

## Commands

```bash
npx medusa develop          # Dev server on :9000
npx medusa db:generate subscriptionModuleService  # Generate migrations for subscription module
npx medusa db:migrate       # Run migrations + sync links
npx medusa exec ./src/scripts/seed-novapatch.ts   # Seed 6 products with 4 price tiers
npx medusa user -e EMAIL -p PASS  # Create admin user
```

## Project Structure (Phase 1)

```
src/
├── modules/subscription/          # Custom module: Subscription + SubscriptionOrder
│   ├── models/subscription.ts     # DML data model (status, interval_days, next_billing_date)
│   ├── models/subscription-order.ts  # DML data model (cycle_number)
│   ├── service.ts                 # Extends MedusaService factory (auto CRUD)
│   └── index.ts                   # SUBSCRIPTION_MODULE = "subscriptionModuleService"
├── links/                         # Module links to native Medusa entities
│   ├── subscription-customer.ts   # Customer ↔ Subscription (stored, isList)
│   ├── subscription-product-variant.ts  # Subscription ↔ ProductVariant (stored)
│   ├── subscription-order.ts      # Subscription → Order (readOnly via original_order_id)
│   └── subscription-order-order.ts  # SubscriptionOrder → Order (readOnly via order_id)
├── workflows/                     # Subscription management workflows (each with compensation)
│   ├── pause-subscription/        # active → paused
│   ├── resume-subscription/       # paused → active (recalculates next_billing_date)
│   ├── cancel-subscription/       # any → canceled
│   └── update-subscription-frequency/  # update interval_days (30|60|90)
├── api/
│   ├── middlewares.ts             # Clerk JWT middleware on /store/me/*
│   └── store/me/subscriptions/    # Protected subscription routes
│       ├── route.ts               # GET list
│       └── [id]/(pause|resume|cancel|frequency)/route.ts  # POST actions
└── scripts/seed-novapatch.ts      # Seeds products, region, sales channel, inventory
```

## Domain Model

### Products

6 vitamin-patch SKUs: `energy`, `sleep`, `glow`, `shield`, `zen`, `woman`. Each has 4 price tiers:
- **One-time**: full price
- **Monthly** (30 days): 20% discount
- **Bimonthly** (60 days): 15% discount
- **Quarterly** (90 days): 10% discount

Canonical display order: `["energy", "sleep", "glow", "shield", "zen", "woman"]`

### Custom Entities

- **Subscription**: `id`, `customer_id` (FK→customer), `variant_id` (FK→product_variant), `status` (active|paused|canceled|past_due|delayed_out_of_stock), `interval_days` (30|60|90), `next_billing_date`, `original_order_id` (FK→order)
- **SubscriptionOrder**: `id`, `subscription_id` (FK→Subscription), `order_id` (FK→order), `cycle_number`

### Metadata Extensions on Native Medusa Entities

- **Customer** `metadata.openpay_customer_id`: Openpay vault ID for tokenized cards
- **LineItem** `metadata.is_subscription`: boolean
- **LineItem** `metadata.interval_days`: 30 | 60 | 90
- **LineItem** `metadata.discount_percentage`: 20 | 15 | 10

## API Contract (what the frontend expects)

### Catalog (public)

- `GET /store/products` — list products with region_id filter
- `GET /store/variants/:id` — single variant detail

### Cart (public)

- `POST /store/carts` — create cart with region_id
- `POST /store/carts/:id/line-items` — add item (once or subscription via metadata)
  - Once: `{ variant_id, quantity }`
  - Subscription: `{ variant_id, quantity, metadata: { is_subscription: true, interval_days, discount_percentage } }`
- `POST /store/carts/:id/line-items/:line_id` — update quantity
- `POST /store/carts/:id/payment-sessions` — create payment session (Openpay plugin)
- `POST /store/carts/:id/complete` — complete cart with `{ openpay_token_id }`

A subscriber must intercept line-item addition to apply the subscription discount when metadata is present. On cart completion, another subscriber creates a Subscription record for each subscription line item.

### Subscriptions (JWT required — `/store/me/*`)

- `GET /store/me/subscriptions` — list user subscriptions
- `POST /store/me/subscriptions/:id/pause` — set status to paused
- `POST /store/me/subscriptions/:id/resume` — set status to active, recalculate next billing date
- `POST /store/me/subscriptions/:id/cancel` — set status to canceled
- `POST /store/me/subscriptions/:id/frequency` — update interval_days

### Payment Methods (JWT required)

- `GET /store/me/payment-methods` — list tokenized cards from Openpay vault
- `POST /store/me/payment-methods/default` — update default card

### Auth Flow

Frontend sends `Authorization: Bearer <clerk_jwt>` on all `/store/me/*` requests. Backend middleware validates the JWT with Clerk and injects customer context into the Medusa request.

### Payment Flow (triangular)

```
Browser → Openpay: cardData → tok_XXX (client-side tokenization, PCI-DSS)
Browser → Medusa:  tok_XXX + deviceSessionId
Medusa  → Openpay: server-to-server charge using tok_XXX
```

Card data never touches Novapatch servers. Only the `tok_XXX` token arrives at the backend.

## Background Jobs (Redis Cron)

### ProcessDailySubscriptions (daily at midnight)

1. Query Subscription where `status = active` AND `next_billing_date <= today`
2. Verify `inventory_quantity` for the variant
3. If **out of stock**: set status to `delayed_out_of_stock` (no charge, no cancel, retry daily)
4. If **in stock**: charge Openpay with customer's default card
5. **Charge OK**: create Order, insert SubscriptionOrder, advance `next_billing_date` by `interval_days`
6. **Charge failed**: set status to `past_due`, fire `subscription.payment_failed` event

## Event Bus Notifications (Resend + React Email)

- `subscription.created` — welcome email with future billing schedule
- `subscription.renewed` — monthly charge receipt
- `subscription.payment_failed` — alert with link to update card
- `subscription.upcoming_charge` — reminder 3 days before next charge

## Admin Extensions

- **Customer detail widget**: React UI injected in admin customer view to manage subscriptions
- **Global route `/a/subscriptions`**: master subscription table with status filters + CSV export

## Multi-Region

Medusa Regions per country (MX first) with local currency and tax rules. Subscription discounts (20/15/10%) apply per-region in active currency. Openpay is MX-only; other regions will use different gateway plugins.

## Integrations Summary

| Service | Role |
|---------|------|
| **Openpay** | Customer vault sync, card tokenization, server-to-server charges (MX) |
| **Clerk** | JWT validation middleware on `/store/me/*`, customer context injection |
| **Resend** | Transactional emails via Event Bus subscriptions, React Email templates |

## Frontend Context

The storefront is a Next.js 15 App Router app (`READMEFrontend.md`). Key details for backend dev:
- Cart lives in localStorage, synced to Medusa at checkout time
- Openpay SDK loaded client-side for PCI-DSS compliant tokenization
- Clerk JWT obtained via `useAuth().getToken()` for protected routes
- Address validation uses Google Maps + COPOMEX (frontend proxies, not backend concern)
- Fallback system: frontend works without backend using hardcoded product data and mock tokens
- Shipping: flat $85 MXN added in frontend checkout sidebar
