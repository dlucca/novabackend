# Fulfillment Flow — Complete Design

**Date:** 2026-04-10  
**Status:** Approved  
**Scope:** Close three gaps in the end-to-end order fulfillment flow: renewal orders missing Envia label generation, missing tracking email, and missing delivery/failed notifications from the Envia webhook.

---

## Current State

The first-purchase flow is fully connected:

```
cart/complete → order.placed → [email confirmación + crear suscripción]
             → order.payment_captured → enviaCreateFulfillmentWorkflow → fulfillment con tracking
```

Subscription renewals have a critical gap — the billing cron creates orders directly via `orderService.createOrders`, bypassing the Medusa cart flow. `order.payment_captured` is never emitted, so Envia is never called:

```
cron → processBillingStep → Order created (status: "pending")
                          ↑ Envia never called — no label, no tracking
```

Additionally, no email is sent when a shipment is created or when the carrier delivers/fails it.

---

## Gap 1 — Renewal orders must trigger Envia fulfillment

**File:** `src/workflows/process-billing-cycle/steps/process-billing.ts`

After emitting `subscription.renewed` (currently the last step in the billing cycle), call `enviaCreateFulfillmentWorkflow` directly with the renewal order ID:

```ts
try {
  await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId: renewalOrder.id } })
} catch (err) {
  logger.error(`${LOG} Envia fulfillment failed for renewal order ${renewalOrder.id}: ${...}`)
  // No re-throw — Openpay charge succeeded; operator can generate label manually from admin
}
```

**Why not emit `order.payment_captured` manually?**  
Emitting that event without going through Medusa's payment capture flow is semantically incorrect and could trigger unintended side effects from other subscribers. Direct call is explicit and safe.

**Failure handling:** Envia failure does not roll back the billing cycle. The charge already succeeded. The operator can generate the label manually from the admin. Error is logged with the order ID for easy recovery.

---

## Gap 2 — Tracking email when fulfillment is created

### New email template: `src/emails/OrderShipped.tsx`

Props:
- `name: string` — customer first name
- `displayId: string | number` — order display ID
- `trackingNumber: string`
- `trackingUrl: string`
- `carrier: string`

Uses existing `EmailLayout`, `EmailHeader`, `EmailFooter` components. Style consistent with `OrderConfirmation.tsx`.

### New subscriber: `src/subscribers/order-shipped-email.ts`

- **Event:** `order.fulfillment_created`
- **Payload:** `{ id: fulfillment_id, order_id }`
- **Logic:**
  1. Fetch order via `Modules.ORDER` (fields: `email`, `display_id`, `shipping_address.first_name`)
  2. Fetch fulfillment via `Modules.FULFILLMENT` with `relations: ["labels"]`
  3. Extract `tracking_number`, `tracking_url` from `fulfillment.labels[0]`
  4. Extract `carrier` from `fulfillment.metadata.carrier`
  5. Send `OrderShipped` email via Resend

This subscriber fires for **both first-purchase and renewal orders** — same code path, no distinction needed.

---

## Gap 3 — Delivery and failure emails from Envia webhook

### Fulfillment metadata update (prerequisite)

**File:** `src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts`

Add `order_id: order.id` to the fulfillment metadata. This allows the webhook handler to resolve the order without an extra query layer:

```ts
metadata: {
  order_id: order.id,           // ← new
  envia_shipment_id: ...,
  carrier: ...,
  // ...existing fields
}
```

### New email templates

**`src/emails/OrderDelivered.tsx`**  
Props: `name`, `displayId`, `trackingNumber`  
Message: confirms delivery, invites the customer to review their order.

**`src/emails/OrderDeliveryFailed.tsx`**  
Props: `name`, `displayId`, `trackingNumber`, `status: "failed" | "returned"`  
Message: explains the delivery could not be completed, provides support contact.

### Webhook update: `src/api/webhooks/envia/route.ts`

In `processEvent`, after updating fulfillment metadata, add email dispatch for terminal statuses:

```
delivered  → fetch order from fulfillment.metadata.order_id → send OrderDelivered email
failed     → fetch order from fulfillment.metadata.order_id → send OrderDeliveryFailed email
returned   → fetch order from fulfillment.metadata.order_id → send OrderDeliveryFailed email (status="returned")
```

Order fetch: `orderService.retrieveOrder(orderId, { relations: ["shipping_address"] })` to get `email`, `display_id`, `shipping_address.first_name`.

Email errors are caught and logged — webhook always returns 200 to Envia (existing behavior preserved).

---

## Complete Email Flow (after changes)

| Trigger | Event | Email |
|---------|-------|-------|
| Cart completed | `order.placed` | Confirmación de pedido (existing) |
| Fulfillment created (first purchase or renewal) | `order.fulfillment_created` | En camino + tracking (new) |
| Envia webhook `delivered` | — | Pedido entregado (new) |
| Envia webhook `failed` / `returned` | — | Problema de entrega (new) |
| Subscription created | `subscription.created` | Bienvenida suscripción (existing) |
| Subscription renewed | `subscription.renewed` | Renovación confirmada (existing) |
| Payment failed | `subscription.payment_failed` | Alerta pago fallido (existing) |

---

## Files Changed / Created

| Action | File |
|--------|------|
| Modified | `src/workflows/process-billing-cycle/steps/process-billing.ts` |
| Modified | `src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts` |
| Modified | `src/api/webhooks/envia/route.ts` |
| Created | `src/subscribers/order-shipped-email.ts` |
| Created | `src/emails/OrderShipped.tsx` |
| Created | `src/emails/OrderDelivered.tsx` |
| Created | `src/emails/OrderDeliveryFailed.tsx` |

---

## Out of Scope

- Admin UI button for manual label generation (not needed — flow is fully automatic)
- Status update emails for `in_transit` / `out_for_delivery` (only terminal states: delivered, failed)
- Multi-carrier tracking page (Envia's `trackUrl` is used directly)
- Retry logic for Envia failures on renewals (manual recovery via admin is sufficient for current scale)
