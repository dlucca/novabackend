# Influencer Discount Codes — Design Spec

**Date:** 2026-04-13
**Branch:** feat/discount-codes
**Status:** Approved

## Overview

Implement influencer discount codes using Medusa v2's native Promotions module. Each influencer in a marketing campaign receives a unique percentage-based discount code with an expiration date. An admin dashboard at `/a/influencers` provides usage metrics and revenue tracking per code.

## Requirements

- Each influencer gets a unique discount code (e.g., `GABY20`)
- Discount type: fixed percentage off the order total
- Expiration: date-based (end of campaign period)
- Applies to: both one-time purchases and the first payment of a subscription
- Renewals: subscription renewals charge at full price — influencer discount is not applied to subsequent billing cycles
- Metrics: usage count, revenue generated per influencer code

## Architecture

### No new modules or database tables

Medusa v2.13 already ships with the Promotions module included in core. All discount logic, code validation, and expiration enforcement is handled natively. No migrations needed for the discount engine itself.

### Data representation

Each influencer is represented as a `Promotion` + `Campaign` pair in Medusa:

```
Promotion
  code:           "GABY20"              ← unique, uppercase
  type:           percentage
  value:          20                    ← e.g. 20% off
  is_automatic:   false                 ← customer must enter the code
  metadata: {
    type:             "influencer",
    influencer_name:  "Gaby Ramírez",
    handle:           "@gabyfit"
  }

Campaign (linked to Promotion)
  name:       "Campaña Gaby Q1 2026"
  starts_at:  2026-04-01T00:00:00Z
  ends_at:    2026-06-30T23:59:59Z     ← expiration date
```

The `metadata.type = "influencer"` field is used to filter influencer promotions separately from any other promotions in the admin.

## Cart Flow

```
1. Customer enters code in checkout UI
2. Frontend → POST /store/carts/:id/promotions
             body: { promo_codes: ["GABY20"] }
3. Medusa validates:
   - Code exists
   - Campaign is currently active (date range)
4. Medusa applies percentage discount to cart subtotal
5. POST /store/carts/:id/complete → order created with discounted total
6. Subscription record is created with the variant's original price
   → renewal billing cycles are unaffected
```

Medusa handles error cases automatically:
- Invalid code → 400
- Expired campaign → 400
- Code already applied to cart → idempotent (no duplicate discount)

## Admin UI

### Route: `/a/influencers`

Custom admin page built with Medusa Admin SDK in `src/admin/routes/influencers/`.

**Main view — influencer table:**

| Influencer | Handle | Code | Discount | Valid Until | Uses | Revenue |
|---|---|---|---|---|---|---|
| Gaby Ramírez | @gabyfit | GABY20 | 20% | Jun 30 | 47 | $12,400 MXN |

**Actions:**
- "New code" button → modal form (name, handle, code, %, end date)
- Click row → order list filtered by that promotion code
- Extend expiration date inline
- Deactivate code (sets campaign `ends_at` to now)

**Metric sources:**
- **Uses**: `promotion.usage_count` — tracked automatically by Medusa
- **Revenue**: sum of `order.total` for orders that include the promotion code, queried via `/admin/orders?promotion_code=GABY20`

## What Does NOT Change

- Subscription module, billing cron, and Openpay charge flow are untouched
- No changes to existing cart or order endpoints
- No new database migrations for the discount engine

## Frontend Integration

The storefront needs to add a discount code input field in the checkout flow. The only new API call required is:

```
POST /store/carts/:id/promotions
{ "promo_codes": ["CODE"] }
```

This is a standard Medusa endpoint — no custom backend code needed for the application layer.

## Files to Create

```
src/admin/routes/influencers/
  page.tsx              ← main influencer list page
  components/
    influencer-table.tsx
    new-influencer-modal.tsx
    influencer-detail.tsx
```

## Out of Scope

- Discount codes for subscription renewals (by design — first order only)
- Usage limits per code (not required; expiration date is sufficient)
- Affiliate commission tracking or payouts
- Influencer-specific landing pages
