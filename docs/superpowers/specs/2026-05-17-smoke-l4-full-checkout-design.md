# Smoke Test Nivel 4 — Full Checkout Happy Path (Staging)

**Fecha:** 2026-05-17
**Estado:** Aprobado, listo para implementación

## Contexto

El Smoke L3 (`pre-checkout.spec.ts`) valida el flujo de compra hasta antes del `/complete`: crea cart, agrega items, calcula shipping con Envia, crea payment session. No ejecuta el cobro ni valida lo que pasa después de pagar.

El L4 cierra esa brecha: ejecuta un cobro real en Openpay sandbox, espera el webhook, valida que la Order se creó correctamente, y cancela la Order para no dejar basura en staging. Cero costo operativo (Openpay sandbox = gratis, Envia queda fuera).

## Objetivo

Detectar regresiones en el path crítico de cobro + webhook + side effects (email, Slack) antes de que afecten a clientes reales en producción.

## Decisiones de diseño

| Tema | Decisión | Justificación |
|---|---|---|
| Envia en L4 | **Skip** — no se genera label | Envia no tiene sandbox; cada label cuesta. El L3 ya valida la cotización; los envíos reales validan generación. |
| Cadencia | **Semanal (lunes 06:00 UTC) + `workflow_dispatch`** | Diario crearía 30 orders/mes basura en staging. Semanal alcanza para detectar regresiones en cobro/webhook. |
| Cleanup | **Auto-cancel al final del test** + `metadata.smoke_test=true` | Self-cleaning. Si el cancel falla, el test falla ruidoso. |
| Email destino | `smoke+staging@novapatch.com` | Alias descartable, historial aislado. |
| Slack destino | Canal dedicado `#smoke-staging` | No contamina `#orders` real; historial del smoke en su propio canal. |
| Webhook validation | **Polling de la Order** (cada 5s hasta 60s) por `payment_status === "captured"` | Valida que webhook llegó + subscriber procesó. Side-effects (email, Slack) se validan en V2. |
| Tipo de compra | **One-time (compra única)** | Path principal. Subscriptions quedan para un L5 futuro si hace falta. |
| Ubicación CI | **Job dentro de `smoke.yml`** | Reusa setup del L3. |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions: smoke.yml                                  │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │ pre-checkout     │    │ full-checkout (NEW)          │   │
│  │ (diario 06:00)   │    │ (lunes 06:00 + dispatch)     │   │
│  └──────────────────┘    └──────────┬───────────────────┘   │
└─────────────────────────────────────┼───────────────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │ Playwright API tests   │
                          │ → Staging Medusa       │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
       ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
       │ Openpay     │         │ Resend      │         │ Slack       │
       │ sandbox     │         │ → smoke+    │         │ → #smoke-   │
       │ → webhook   │         │   staging@  │         │   staging   │
       └─────────────┘         └─────────────┘         └─────────────┘
```

## Flow del test

```
1. Crear cart           POST /store/carts
                        { region_id, metadata: { smoke_test: true } }

2. Agregar line item    POST /store/carts/:id/line-items
                        { variant_id, quantity: 1 }

3. Set address          POST /store/carts/:id
                        { shipping_address, email: "smoke+staging@novapatch.com" }

4. Apply shipping       POST /store/carts/:id/shipping-methods
                        { option_id: <cheapest_from_envia> }

5. Create payment       POST /store/carts/:id/payment-sessions

6. Complete checkout    POST /store/carts/:id/complete
                        { openpay_token_id: "tok_test_visa_4111" }
                        → response includes order_id

7. POLL until captured  GET /admin/orders/:order_id
                        every 5s, max 60s
                        wait for payment_status === "captured"

8. Assert order shape   - order.email === "smoke+staging@..."
                        - order.metadata.smoke_test === true
                        - order.total === expected
                        - order.items[0].variant_id matches

9. Cancel order         POST /admin/orders/:order_id/cancel

10. Assert canceled     GET /admin/orders/:order_id
                        - status === "canceled"
```

## Componentes

### Frontend — `novafrontend`

**Nuevo:** `apps/storefront/tests/e2e/smoke/full-checkout.spec.ts`
- Spec Playwright usando el fixture `request` (API-level, no browser)
- Reusa helpers existentes del L3 donde aplique
- `afterAll` hook: best-effort cancel si el test murió antes del step 9

**Nuevo:** `apps/storefront/tests/e2e/smoke/fixtures/openpay.ts`
```ts
// Tokens sandbox documentados por Openpay
export const OPENPAY_SANDBOX_TOKENS = {
  visa_approve: "tok_test_visa_4111",
  // Reservado para tests futuros (decline path no aplica al L4 happy-path)
  // visa_decline: "tok_test_visa_4000",
}
```

**Modificado:** `.github/workflows/smoke.yml`
- Agregar job `full-checkout` con:
  - `schedule: "0 6 * * 1"` (lunes 06:00 UTC)
  - `workflow_dispatch` (ya existe globalmente)
  - Mismo `runs-on` y setup que el job actual
  - Secrets: `STAGING_BASE_URL`, `STAGING_ADMIN_API_KEY`

### Backend — `novabackend`

**Verificar (no cambios obligatorios, sólo confirmar):**
- `cart.metadata` se propaga a `order.metadata` en Medusa v2. Confirmar con un cart de prueba antes de implementar el L4.
- Endpoint nativo `POST /admin/orders/:id/cancel` está disponible y autenticable con `x-medusa-access-token`.

### Configuración

**Railway staging — env vars (verificar/setear):**
- `OPENPAY_PUBLIC_KEY` — sandbox (empieza con `pk_test_` típicamente)
- `OPENPAY_PRIVATE_KEY` — sandbox
- `OPENPAY_MERCHANT_ID` — sandbox merchant
- `SLACK_ORDERS_WEBHOOK_URL` — apunta a `#smoke-staging` (NO al `#orders` real)
- `RESEND_API_KEY` — el mismo de staging; los emails van a un alias descartable

**Crítico:** confirmar que staging NO tiene credenciales Openpay de producción antes del primer run.

**GHA Secrets (nuevos):**
- `STAGING_ADMIN_API_KEY` — admin API key con scope para ver y cancelar orders

**Slack:**
- Crear canal `#smoke-staging` en el workspace
- Generar webhook URL para ese canal
- Pegar en Railway staging `SLACK_ORDERS_WEBHOOK_URL`

**Email alias:**
- Crear forwarder `smoke+staging@novapatch.com` → buzón descartable (o `/dev/null` real, sólo importa que Resend no rebote)

## Error handling

| Escenario | Comportamiento |
|---|---|
| Cualquier step API falla | Test falla, GHA notifica (ya configurado para el L3) |
| Polling timeout (60s sin webhook) | Falla con mensaje `"Openpay webhook did not arrive within 60s — check webhook config or subscriber"` |
| Step 9 (cancel) falla | Test falla. `afterAll` intenta cancel best-effort (con `try/catch`, no doble-falla) |
| Test muere abruptamente (timeout global) | `afterAll` intenta cancelar la order si capturó `order_id`, best-effort |

## Costo y volumen

- 1 charge/semana en Openpay sandbox → $0
- 1 order/semana en DB staging → ~52/año, marcadas `smoke_test=true` y `status=canceled`, ignorables
- 1 email/semana a `smoke+staging@...` → descartado
- 1 mensaje/semana en `#smoke-staging` → historial de auditoría

## Out of scope (futuro)

- **L4.5 manual con Envia:** generar+cancelar label real, opcionalmente. Para correr antes de releases que tocan shipping.
- **L5 subscription:** validar el path de `is_subscription: true` end-to-end (crea Subscription, no sólo Order).
- **V2 con verificación de side effects:** chequear Resend API + Slack API para confirmar que email y notif salieron. Por ahora confiamos en que si la order quedó `captured`, el subscriber se ejecutó.
- **Observability:** alert separado (Sentry/Datadog) si el webhook no llega en N minutos. Reemplaza eventualmente el polling como mecanismo de detección.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Staging tiene credenciales Openpay de producción por error | Step manual antes del primer run: verificar prefijo `pk_test_` en Railway. Documentar en runbook. |
| Webhook de Openpay no llega en 60s en staging por latencia | Aumentar timeout a 120s si pasa en producción del smoke. Mensaje de error explícito ayuda a diagnosticar. |
| `cart.metadata` no se propaga a `order.metadata` | Validar antes de implementar. Si Medusa no lo hace, agregar subscriber `cart.completed` → set order metadata. |
| Auto-cancel falla por estado de order | `POST /admin/orders/:id/cancel` requiere ciertos estados. Si la order ya está `captured` debería poder cancelarse. Validar antes. |
