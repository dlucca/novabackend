# Smoke Test Nivel 4 — Full Checkout en Producción

**Fecha:** 2026-05-17
**Estado:** Aprobado, listo para implementación

## Contexto

El Smoke L3 (`pre-checkout.spec.ts`) valida el flujo de compra hasta antes del `/complete` contra producción: cart, items, shipping rate de Envia, payment session. No ejecuta el cobro.

El L4 cierra esa brecha ejecutando un cobro real en **Openpay producción** con una tarjeta tokenizada del founder + código de descuento 99% off + free shipping. Costo residual ~$1-5 MXN por run; cero shipping; cero label Envia.

El propósito es detectar regresiones en credenciales prod, webhook prod, deliverability de Resend prod y Slack prod — cosas que un smoke en sandbox/staging no puede validar.

## Objetivo

Validar end-to-end en producción que:
1. Openpay producción cobra correctamente con un token del vault
2. El webhook de Openpay llega y `order.payment_captured` se dispara
3. Resend producción envía el email transaccional
4. Slack producción recibe la notificación (con flag visual `[SMOKE]`)
5. La Order queda creada con metadata correcta y se puede cancelar

Detección temprana antes de que un cliente real choque con la regresión.

## Decisiones de diseño

| Tema | Decisión | Justificación |
|---|---|---|
| Ambiente | **Producción** | Validar credenciales y webhooks reales. Staging no cubre config drift. |
| Cadencia | **Semanal (lunes 06:00 UTC) + `workflow_dispatch`** | Costo trivial; detección semanal alcanza. |
| Tipo de compra | **One-time, 1 item** | Path principal. Subscriptions = L5 futuro. |
| Costo por run | **Lo que quede después de 99% off + free shipping** (~$1-5 MXN) | Sin refund automático — el residual es trivial. |
| Envia | **Skipped vía metadata guard** | Ya validado en envíos reales de muestras; un label real costaría $80-130/run. |
| Email destino | `smoke@novapatch.care` (real inbox) | Validamos deliverability de Resend prod. |
| Slack destino | `#orders` (canal real) con flag `[SMOKE]` 🧪 en el mensaje | Mismo canal que producción — el team ve que el smoke pasó y no se confunde con orden real. |
| Cleanup | Auto-cancel de la Order al final del test | Self-cleaning. Sin refund (costo es trivial). |
| Tarjeta | Tarjeta personal del founder, tokenizada una vez en el vault de Openpay | `customer_id` + `card_id` guardados en GHA secrets. |
| Webhook validation | Polling de la Order (cada 5s, max 60s) hasta `payment_status === "captured"` | Confirma webhook + subscriber procesó. |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions: smoke.yml                                  │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │ pre-checkout     │    │ full-checkout (NEW)          │   │
│  │ (diario, prod)   │    │ (lunes, prod, $$ real)       │   │
│  └──────────────────┘    └──────────┬───────────────────┘   │
└─────────────────────────────────────┼───────────────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │ Playwright API tests   │
                          │ → PROD Medusa          │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
       ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
       │ Openpay     │         │ Resend      │         │ Slack       │
       │ producción  │         │ → smoke@    │         │ → #orders   │
       │ → webhook   │         │   novapatch │         │   [SMOKE] 🧪│
       └─────────────┘         └─────────────┘         └─────────────┘

                          Envia: NO se dispara
                          (guardeado por metadata.smoke_test=true)
```

## Setup one-time en producción

Antes del primer run del L4, hay que tener:

1. **Customer `smoke@novapatch.care`** en Medusa producción
   - Email: `smoke@novapatch.care`
   - El inbox debe existir y recibir realmente los emails
2. **Tarjeta tokenizada en Openpay vault** asociada al customer
   - Tokenizar la tarjeta personal del founder una vez vía el flujo normal del frontend
   - Guardar `openpay_customer_id` y `card_id` (token del vault) — van a GHA secrets
3. **Discount code dedicado**
   - Code: `SMOKE-INTERNAL-<RANDOM>` (sufijo random, no compartible)
   - Tipo: 99% off productos + free shipping
   - Limitado al email `smoke@novapatch.care`
   - Usage limit: 100 (renovable cuando se acerque)
4. **Guard en backend** — `src/subscribers/envia-fulfillment.ts`:
   ```ts
   if ((order.metadata as any)?.smoke_test === true) {
     logger.info(`[envia-fulfillment] Skipping smoke test order ${orderId}`)
     return
   }
   ```
   (Después del fetch de la order; antes del `enviaCreateFulfillmentWorkflow.run`)
5. **Slack flag visual** — modificar el mapper que arma los blocks de `#orders` para que cuando `order.metadata.smoke_test === true`, prepende `🧪 [SMOKE]` al título del mensaje.

## Flow del test

```
1. Crear cart           POST /store/carts
                        { region_id, email: "smoke@novapatch.care",
                          metadata: { smoke_test: true } }

2. Agregar line item    POST /store/carts/:id/line-items
                        { variant_id, quantity: 1 }

3. Aplicar promo        POST /store/carts/:id/promotions
                        { promo_codes: ["SMOKE-INTERNAL-<RANDOM>"] }

4. Set shipping addr    POST /store/carts/:id
                        { shipping_address: <fixture>, email: ... }

5. Apply shipping       POST /store/carts/:id/shipping-methods
                        { option_id: <cheapest> }
                        (cost = $0 por el código de descuento)

6. Create payment       POST /store/carts/:id/payment-sessions

7. Complete checkout    POST /store/carts/:id/complete
                        { openpay_customer_id, card_id }
                        → response includes order_id

8. POLL until captured  GET /admin/orders/:order_id
                        every 5s, max 60s
                        wait for payment_status === "captured"

9. Assert order shape   - email === "smoke@novapatch.care"
                        - metadata.smoke_test === true
                        - total <= 5 MXN (sanity check del descuento)
                        - items[0].variant_id matches

10. Cancel order        POST /admin/orders/:order_id/cancel

11. Assert canceled     status === "canceled"
```

## Componentes

### Frontend — `novafrontend`

**Nuevo:** `apps/storefront/tests/e2e/smoke/full-checkout.spec.ts`
- Spec Playwright API-level (`request` fixture, no browser)
- Reusa helpers del L3 (creación de cart, add item, shipping)
- `afterAll` hook: best-effort cancel si murió antes del step 10

**Modificado:** `apps/storefront/.github/workflows/smoke.yml`
- Nuevo job `full-checkout`:
  - `schedule: "0 6 * * 1"` (lunes 06:00 UTC)
  - `workflow_dispatch` (ya global)
  - Mismo setup base que el job actual
  - Env vars adicionales (ver Secrets)

### Backend — `novabackend`

**Modificado:** `src/subscribers/envia-fulfillment.ts`
- Guard al inicio: skip si `order.metadata?.smoke_test === true`
- Fetch la order primero (o leer del event payload si está disponible) para chequear metadata

**Modificado:** `src/lib/slack-mappers.ts` (o el mapper equivalente que arma blocks para órdenes regulares)
- Si `order.metadata.smoke_test === true`, prepender `🧪 [SMOKE] ` al título del bloque principal

### Configuración prod

**Railway producción (ya existe, no cambia):**
- `OPENPAY_*` apuntando a producción
- `RESEND_API_KEY` prod
- `SLACK_ORDERS_WEBHOOK_URL` → `#orders` real
- `ENVIA_API_TOKEN` (no se va a usar porque el guard skipea)

**GHA Secrets nuevos en `novafrontend`:**
- `PROD_ADMIN_API_KEY` — admin API key con scope para `GET /admin/orders` y `POST /admin/orders/:id/cancel`
- `SMOKE_OPENPAY_CUSTOMER_ID` — el customer_id de `smoke@novapatch.care` en Openpay vault
- `SMOKE_OPENPAY_CARD_ID` — el card_id (token vault) de la tarjeta del founder
- `SMOKE_PROMO_CODE` — el discount code `SMOKE-INTERNAL-<RANDOM>`
- `SMOKE_VARIANT_ID` — el variant_id que el smoke compra (un SKU fijo, ej: energy single-pack)

### Cuenta de email

Garantizar que `smoke@novapatch.care` existe y recibe. Cualquier inbox que querramos auditar — yo iría con forwarder a `dlucca@gmail.com` para revisión visual ocasional.

## Error handling

| Escenario | Comportamiento |
|---|---|
| Cualquier step API falla | Test falla → Slack notification a `#smoke-alerts` o `#orders` (lo que ya tenés configurado para L3) |
| Polling timeout (60s sin captured) | Falla con mensaje claro `"Openpay webhook did not arrive — check webhook config or subscriber"` |
| Step 10 (cancel) falla | Test falla. `afterAll` intenta cancel best-effort |
| Test muere antes del step 10 | `afterAll` intenta cancel con el `order_id` capturado |
| Discount code expira / usage limit | Falla en step 3, mensaje claro pide renovar el código |
| Tarjeta expirada / declined | Falla en step 7, mensaje pide re-tokenizar |

## Costo y volumen

- 1 charge/semana en Openpay prod → **~$1-5 MXN/run** (residual después del 99% off; shipping = $0)
- ~52 charges/año → **~$50-260 MXN/año total**. Trivial.
- 1 order/semana en DB prod → marcada `smoke_test=true` y `status=canceled`. Hay que asegurarse de que reportes/dashboards/CSV exports filtren `metadata.smoke_test=true` cuando muestran "ventas".
- 1 email/semana a `smoke@novapatch.care` → forwarder a tu inbox o ignorado
- 1 mensaje/semana en `#orders` con flag `[SMOKE]` 🧪

## Out of scope (futuro)

- **L5 subscription:** validar el path de `is_subscription: true` end-to-end. Crea Subscription real, hay que considerar el ciclo de billing recurrente — más complejo.
- **Refund automático:** si en algún momento el costo residual molesta o aumenta, agregar step post-cancel que llama Openpay refund API. Hoy no vale el esfuerzo.
- **Verificación activa de side effects:** chequear via Resend API + Slack API que el email/mensaje efectivamente salió (no sólo que la order quedó `captured`). Vale la pena cuando el L4 esté estable.
- **Subscriptions filtering en reportes:** asumimos que reports filtran `smoke_test=true` — si no lo hacen, agregar como tarea aparte.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Tarjeta del founder expira y el smoke se rompe silencioso | Mensaje de error explícito en step 7 + alert por Slack. Renovación manual cada 2-4 años (set recordatorio). |
| Discount code es filtrado y usado por terceros | Limitar a email específico + usage limit 100 + nombre con sufijo random. Si se filtra: revocar y emitir nuevo. |
| Reportes de ventas incluyen smoke orders | Validar en implementación: agregar filtro `metadata.smoke_test = true` en queries de reports/admin/CSV. Tarea verificable. |
| Slack notification mezcla con orders reales | Flag `[SMOKE]` 🧪 en mapper. Team training: ese flag = ignorar. |
| Envia se dispara por bug en el guard | Tests en backend del guard + monitoreo del primer run en logs. Si pasa una vez: cancelar label desde Envia admin manualmente. |
| Order queda sin cancelar (test muere) | `afterAll` hook + manual cleanup quincenal con script tipo `cleanup-smoke-orders` similar al de carts. |

## Pre-flight checklist

Antes del primer run, en este orden:

1. [ ] Customer `smoke@novapatch.care` creado en Medusa prod
2. [ ] Inbox `smoke@novapatch.care` configurado (forwarder o real)
3. [ ] Tarjeta tokenizada en Openpay vault del customer
4. [ ] Discount code `SMOKE-INTERNAL-<RANDOM>` creado en Medusa prod (99% off + free shipping, limitado al email)
5. [ ] Guard `smoke_test` en `envia-fulfillment.ts` deployed a prod
6. [ ] Flag `[SMOKE]` 🧪 en Slack mapper deployed a prod
7. [ ] Admin API key generada con scope mínimo (orders:read, orders:cancel)
8. [ ] Los 5 GHA secrets seteados: `PROD_ADMIN_API_KEY`, `SMOKE_OPENPAY_CUSTOMER_ID`, `SMOKE_OPENPAY_CARD_ID`, `SMOKE_PROMO_CODE`, `SMOKE_VARIANT_ID`
9. [ ] Primer run manual vía `workflow_dispatch` para validar — observar logs y Slack
10. [ ] Habilitar el schedule semanal
