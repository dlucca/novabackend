# Slack Order Message Format — Design Spec

**Date:** 2026-04-13
**Branch:** feat/slack-order-message-format

---

## Context

The existing Slack notification fires on `order.placed` and includes customer name, email, location, items count, and total. Operations needs a leaner message that only shows what matters for fulfillment: order number, date, products with quantities, and a direct link to the Envia shipping label.

Because the label URL only exists after the Envia workflow completes (triggered by `order.payment_captured`), the notification must be moved to that point in the flow.

---

## Decision

Move the Slack notification from the `order.placed` subscriber into a new step at the end of the `envia-create-fulfillment` workflow. Delete the existing subscriber.

---

## Message Format

Four Block Kit blocks:

```
🚚 Orden lista para envío          ← header

Orden     #142
Fecha     13 abr 2026, 14:32       ← section with two fields

Productos
• Energy Patch x1
• Sleep Patch x2                   ← section with mrkdwn text

Etiqueta  <url|Ver etiqueta PDF>   ← section with mrkdwn text (hyperlink)
```

Shipping-cost line items (those with `metadata.is_shipping`) are excluded from the products list, matching the existing filter.

---

## Architecture

### Flow

```
order.payment_captured
  → envia-fulfillment subscriber
    → fetchOrderForFulfillmentStep
    → generateEnviaLabelStep          ← label URL available here (shipment.label)
    → createMedusaFulfillmentStep
    → notifySlackStep                 ← NEW: sends Slack message
```

### Files

| Action | File |
|--------|------|
| Modify | `src/lib/slack-mappers.ts` — replace `mapOrderToSlackBlocks` with `mapFulfillmentToSlackBlocks(order, labelUrl)` |
| New | `src/workflows/envia-create-fulfillment/steps/notify-slack.ts` |
| Modify | `src/workflows/envia-create-fulfillment/index.ts` — add `notifySlackStep` after `createMedusaFulfillmentStep` |
| Delete | `src/subscribers/order-placed-slack.ts` |
| Modify | `src/__tests__/lib/slack-mappers.unit.spec.ts` — update tests for new function signature |

### `notifySlackStep` behavior

- Reads `SLACK_ORDERS_WEBHOOK_URL` from env; if not set, logs a warning and returns without throwing.
- Calls `mapFulfillmentToSlackBlocks(order, shipment.label)` and sends via `sendSlackNotification`.
- Errors are caught and logged — never thrown — so a Slack failure never blocks fulfillment registration.
- No compensation needed: Slack messages are fire-and-forget.

### `mapFulfillmentToSlackBlocks(order, labelUrl)` signature

```ts
export function mapFulfillmentToSlackBlocks(order: any, labelUrl: string): SlackBlock[]
```

Inputs used from `order`: `display_id`, `id`, `created_at`, `items`.
`labelUrl` comes from `shipment.label` (the Envia PDF URL).

---

## Testing

- Update `slack-mappers.unit.spec.ts`: replace tests for `mapOrderToSlackBlocks` with tests for `mapFulfillmentToSlackBlocks`.
- Cover: header text, order display_id, date formatting, products list, label URL link, empty items edge case.
- `notifySlackStep` is not unit-tested separately (it is a thin wrapper); covered implicitly by the workflow integration.

---

## Out of Scope

- Sending a separate `order.placed` notification (ops confirmed one message is sufficient).
- Slack message threading or updates.
- Other channels or notification types.
