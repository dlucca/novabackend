# Slack Order Notifications — Design Spec

**Date:** 2026-04-12
**Branch:** feat/slack-order-notifications
**Status:** Approved

---

## Summary

Automatically notify the Novapatch internal team in Slack whenever a new order is placed in Medusa. The notification fires from the backend on the `order.placed` event, formats order data as a Slack Block Kit message, and POSTs it to a configured Incoming Webhook.

---

## Architecture

### New files

```
src/
├── subscribers/
│   └── order-placed-slack.ts       # Listens to order.placed, coordinates notification
├── lib/
│   ├── slack-client.ts             # sendSlackNotification(blocks) — fetch POST to webhook
│   └── slack-mappers.ts            # mapOrderToSlackBlocks(order) — transforms order to Block Kit
```

### Unchanged files

- `src/subscribers/order-placed.ts` — not modified; handles subscription creation independently
- `src/subscribers/order-confirmation-email.ts` — not modified

### Data flow

```
order.placed
  └─→ order-placed-slack.ts (subscriberId: "order-placed-slack-notification")
        ├─→ Modules.ORDER.retrieveOrder(id, { relations: ["items", "shipping_address"] })
        ├─→ mapOrderToSlackBlocks(order)  →  Block Kit payload
        └─→ sendSlackNotification(blocks) →  fetch POST to SLACK_ORDERS_WEBHOOK_URL
```

---

## Components

### `src/subscribers/order-placed-slack.ts`

- Resolves `logger` from container (fallback to `console`)
- Checks for `SLACK_ORDERS_WEBHOOK_URL`; if missing, logs `warn` and returns
- Retrieves order with relations `["items", "shipping_address"]`
- Calls mapper, then client
- Catches all errors — never throws; logs with `orderId` context

**Config:**
```ts
export const config: SubscriberConfig = {
  event: "order.placed",
  context: { subscriberId: "order-placed-slack-notification" },
}
```

### `src/lib/slack-client.ts`

- Exports `sendSlackNotification(blocks: SlackBlock[]): Promise<void>`
- POSTs to `SLACK_ORDERS_WEBHOOK_URL` with `Content-Type: application/json`
- Throws `Error` if response is not `ok` (caller handles)
- No retry logic in Phase 1 (Phase 2 concern)

### `src/lib/slack-mappers.ts`

- Exports `mapOrderToSlackBlocks(order: any): SlackBlock[]`
- Builds Block Kit payload with: header, divider, fields section, items section, total section
- All optional fields degrade gracefully (null-safe throughout)

---

## Slack Message Format (Block Kit)

```
🛍️ Nueva orden recibida
──────────────────────────
Orden        #1024
Fecha        12 Apr 2026, 13:42
Cliente      Juan Pérez
Email        juan@email.com
Ubicación    CDMX, Ciudad de México · MX
──────────────────────────
Productos
  • Energy x1
  • Sleep x2
──────────────────────────
Total        MXN $1,500.00
```

### Field mapping

| Slack field | Source | Fallback |
|---|---|---|
| Orden | `order.display_id` | `order.id` |
| Fecha | `order.created_at` | — |
| Cliente | `shipping_address.first_name + last_name` | `"(sin nombre)"` |
| Email | `order.email` | `"(sin email)"` |
| Ubicación | `city + province + country_code` | fields that are available |
| Productos | `items[].title + quantity` | — |
| Total | `order.total / 100` formatted | — |
| Moneda | `order.currency_code.toUpperCase()` | — |

Items with `metadata.is_shipping === true` are excluded from the product list (same pattern as order-confirmation-email).

---

## Error Handling

Three failure scenarios, none of which affect the order:

1. **Webhook not configured** — `SLACK_ORDERS_WEBHOOK_URL` is empty/undefined: subscriber logs `warn` and returns early.
2. **Slack HTTP error** — `slack-client.ts` throws `Error` with status text; subscriber catches, logs `error` with `orderId`, returns.
3. **Network timeout / connection error** — same as above.

Log format on failure:
```
[order-placed-slack] Failed to notify Slack for order <orderId>: <error message>
```

---

## Configuration

**Environment variable:**

```
SLACK_ORDERS_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Must be added to:
- `.env` (local development)
- Railway environment variables (production)

---

## Testing

Unit test for `mapOrderToSlackBlocks` covering:

1. Full order (all fields present)
2. Minimal order (null `shipping_address`, missing optional fields)
3. Order with multiple items
4. Order in non-MXN currency
5. Order without email

`sendSlackNotification` and the subscriber are I/O coordination — no unit test required. Manual end-to-end test: place a test order and verify Slack message appears in the configured channel.

---

## Out of Scope (Phase 1)

- Retry logic / job queue
- Multiple Slack channels
- WhatsApp / email notifications
- ERP integration
- Admin link in message
- Deduplication

---

## Phase 2 Considerations

The architecture is designed for extension:
- Adding a second destination (e.g., WhatsApp) means a new subscriber + client in `src/lib/`
- Retry logic can be added to `slack-client.ts` using the `withRetry` pattern from `envia-client.ts`
- Admin deep-link can be appended to `mapOrderToSlackBlocks` once `MEDUSA_ADMIN_URL` is available

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| CA-01 | Order placed → Slack message sent to configured channel |
| CA-02 | Message contains all fields from RF-03 |
| CA-03 | Slack webhook failure → error logged, order unaffected |
| CA-04 | `SLACK_ORDERS_WEBHOOK_URL` missing → warning logged, no crash |
| CA-05 | Order with null optional fields → message sends without error |
