# MX Shipping: Zone Flat Rates + Backend Rate Shopping

## Summary

México checkout charges a flat shipping fee per zone, while the backend picks the cheapest carrier at fulfillment time. The customer never sees carrier quotes — only a fixed price on checkout and the estimated delivery window on the confirmation page and email.

Argentina and other markets are out of scope.

## Goals

- Eliminate Envía latency from the checkout path (cotizar carriers after payment, not during).
- Charge the customer a predictable shipping price based on destination zone.
- Capture an operational margin on shipping by paying Envía's cheapest available carrier while charging the flat rate.
- Surface the delivery ETA once the shipment has been generated (order confirmation screen + email).

## Non-goals

- Carrier selection UI / radio buttons.
- Remote/extreme zones pricing (a third tier may come later if we see losses).
- Rate shopping for Argentina or any non-MX market.
- Real-time ETA during checkout.

## Zones and flat rates

| Zone | Coverage | Customer pays |
|---|---|---|
| **CDMX + Estado de México** | CDMX state + all Edo. Mex. postal codes | $90 MXN |
| **Nacional** | All other Mexican states | $145 MXN |

Configured in the Medusa admin as two zone-scoped shipping options on the MX location. Amounts are editable from admin without code changes.

## Carrier pool (backend rate shopping)

Envía `/ship/rate/` is queried in parallel for these 6 carriers:

- Paquetexpress
- Sendex
- AMPM
- Estafeta
- DHL
- FedEx

Cheapest successful response wins. If **all** fail, fall back to Envía's default carrier (current behavior of `envia-create-fulfillment`).

## User-facing flow

1. Customer fills shipping address on `/mx/checkout`.
2. Frontend calls `medusa.cart.getShippingOptions(cart_id)` — Medusa returns the zone-matching option.
3. Frontend applies it; cart total reflects $90 or $145.
4. Customer pays via Openpay as today.
5. Confirmation screen shows: `"Entrega estimada: {envia_eta}. Te enviaremos la guía en las próximas 24 horas."`
6. Order confirmation email (Resend) includes the same ETA.

## Post-payment backend flow

`envia-create-fulfillment` workflow, updated:

1. Query Envía for rates for the 6 carriers in parallel (`Promise.allSettled`).
2. Discard rejected/empty responses.
3. Sort remaining by `totalPrice` asc, take index 0.
4. If no viable carrier → call `generateShipment` with no carrier hint (Envía default).
5. Call `/ship/generate/` with the chosen `carrier` + `service`.
6. Persist in `order.metadata`:
   - `envia_carrier` — e.g. `"dhl"`
   - `envia_service` — e.g. `"express"`
   - `envia_eta` — value of `deliveryEstimate` (string like `"2-3 días hábiles"`)
   - `envia_carrier_cost` — number (what we paid Envía)
   - `envia_quoted_carriers` — array of all quoted prices for audit (optional)

## Architectural boundaries

**Medusa admin (one-time config):**
- Two shipping options with zone rules.

**Backend changes:**
- `src/workflows/envia-create-fulfillment/steps/*` — rate-shop step inserted before `generateShipment`.
- `src/lib/envia-client.ts` — add `getBestRateFromCarriers(req, carriers: string[])` helper (parallel `getRate` + cheapest pick).
- Notification subscriber for `order.placed` — inject `envia_eta` into the email template.

**Frontend changes:**
- `apps/storefront/app/[locale]/checkout/page.tsx` — remove hardcoded `85` shipping defaults; rely on what Medusa returns from `getShippingOptions`.
- `apps/storefront/app/[locale]/checkout/success/page.tsx` (or equivalent) — render `order.metadata.envia_eta`.

## Data model

No new entities or tables. All state lives in `order.metadata`.

## Error handling

| Failure mode | Handling |
|---|---|
| Envía `/ship/rate/` times out for a carrier | Skip it, use remaining responses |
| All 6 carriers fail | Call `/ship/generate/` with default carrier (current behavior) |
| `/ship/generate/` fails | Existing behavior: log and operator manually generates label. Order still succeeds. |
| Shipping zone mismatch (unknown state) | Fallback to "Nacional" zone ($145) |
| No shipping option returned by Medusa | Hard error, return 422 — should not happen if zones configured |

## Observability

- Log each rate response: carrier, price, success/error. One line per shipment.
- Log the winning carrier + margin: `[envia-rate-shop] chose=dhl price=110.50 flat=145 margin=34.50`.
- Slack notification on 100% rate failures (operator signal that Envía is down).

## Rollback

- Revert the rate-shopping step in `envia-create-fulfillment` — workflow returns to single-carrier call.
- Medusa admin: revert or leave shipping options (harmless).
- Frontend: no behavior change if backend returns default amounts.

## Open questions

- None at this stage. Margin analysis will inform whether we need a third "Extremo" zone.

## Out of scope explicitly

- Argentina and other markets.
- Customer-visible carrier choice.
- Real-time ETA during checkout.
- Dynamic rate-based pricing shown to customer.
