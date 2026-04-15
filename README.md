# Novapatch Backend

Motor de e-commerce headless para la plataforma de parches vitamínicos por suscripción Novapatch. Construido sobre **Medusa.js v2** con soporte multi-región (México como mercado inicial; Brasil, Argentina, Colombia y Chile en roadmap).

---

## Tabla de contenidos

1. [Stack](#stack)
2. [Arquitectura general](#arquitectura-general)
3. [Requisitos](#requisitos)
4. [Variables de entorno](#variables-de-entorno)
5. [Comandos](#comandos)
6. [Estructura del proyecto](#estructura-del-proyecto)
7. [Modelo de dominio](#modelo-de-dominio)
8. [API — Referencia completa](#api--referencia-completa)
9. [Flujo de pago (triangular PCI-DSS)](#flujo-de-pago-triangular-pci-dss)
10. [Flujo 3D Secure (3DS)](#flujo-3d-secure-3ds)
11. [Autenticación (Clerk JWT)](#autenticación-clerk-jwt)
12. [Flujo de envíos (Envia.com)](#flujo-de-envíos-enviacom)
13. [Billing recurrente (Cron job)](#billing-recurrente-cron-job)
14. [Notificaciones por email](#notificaciones-por-email)
15. [Notificaciones Slack (operaciones)](#notificaciones-slack-operaciones)
16. [Webhooks entrantes](#webhooks-entrantes)
17. [Admin: Gestión de influencers](#admin-gestión-de-influencers)
18. [Descuentos y cupones](#descuentos-y-cupones)
19. [Testing](#testing)
20. [Despliegue en Railway](#despliegue-en-railway)
21. [Integraciones — resumen](#integraciones--resumen)
22. [Estado de desarrollo (fases)](#estado-de-desarrollo-fases)

---

## Stack

| Capa | Tecnología | Versión |
|------|------------|---------|
| Framework | Medusa.js | 2.13.1 |
| Runtime | Node.js / TypeScript | ≥20 |
| Base de datos | PostgreSQL | cualquiera compatible |
| Cache y colas | Redis | cualquiera compatible |
| Auth | Clerk (`@clerk/backend`) | ^3.2.4 |
| Pagos | Openpay (México) | HTTP directo |
| Envíos | Envia.com (multi-carrier) | HTTP directo |
| Email transaccional | Resend + React Email | — |
| Notificaciones internas | Slack (webhook) | — |
| Admin UI | Medusa Admin (extensible) | incluido en v2 |

---

## Arquitectura general

```
┌──────────────────────────────────────────────────────────────────┐
│  Storefront (Next.js 15)                                         │
│  • Openpay SDK (client-side)  →  tok_XXX (PCI-DSS)              │
│  • Clerk SDK  →  JWT Bearer                                      │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼─────────────────────────────────────────┐
│  Medusa Backend (Node.js :9000)                                  │
│  ├── REST API (public + /store/me/* autenticado)                 │
│  ├── Módulo Subscription (custom)                                │
│  ├── Módulo Openpay Payment (custom provider)                    │
│  ├── Workflows (pause/resume/cancel/frequency/billing/fulfillment)│
│  ├── Cron job diario (ProcessDailySubscriptions, 00:00 CST)      │
│  └── Event Bus → Subscribers → Resend / Slack                   │
└────────────────────────┬─────────────────────────────────────────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     PostgreSQL        Redis        Servicios externos
     (persistencia)  (colas/cache)  • Openpay API
                                    • Envia.com API
                                    • Clerk API
                                    • Resend API
                                    • Slack Webhook
```

---

## Requisitos

- **Node.js** >= 20
- **PostgreSQL** (local o gestionado)
- **Redis** (local o gestionado)
- **npm** >= 10

---

## Variables de entorno

Copiar `.env.template` como `.env` en la raíz del proyecto y rellenar los valores:

```bash
# ── Base de datos y cache ──────────────────────────────────────────────────────
DATABASE_URL=postgres://user:password@localhost:5432/novabackend
REDIS_URL=redis://localhost:6379

# ── Seguridad ──────────────────────────────────────────────────────────────────
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret

# ── CORS ───────────────────────────────────────────────────────────────────────
STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:5173,http://localhost:9000
AUTH_CORS=http://localhost:3000,http://localhost:5173,http://localhost:9000
# En producción añadir también los dominios del admin y storefront:
# ADMIN_CORS=...,https://admin.novapatch.care
# AUTH_CORS=...,https://admin.novapatch.care,https://novapatch.care

# ── Storefront URL (para redirect 3DS) ────────────────────────────────────────
STOREFRONT_URL=http://localhost:3000
# En producción: https://novapatch.care

# ── Clerk (Auth) ───────────────────────────────────────────────────────────────
CLERK_SECRET_KEY=sk_test_...
# NOTA: si está vacío en desarrollo, el bypass activa clerk_email = dev@novapatch.care
# En producción esta variable es OBLIGATORIA

# ── Openpay (Pagos México) ─────────────────────────────────────────────────────
OPENPAY_MERCHANT_ID=
OPENPAY_PRIVATE_KEY=
OPENPAY_SANDBOX=true          # Cambiar a false en producción

# ── Envia.com (Envíos) ─────────────────────────────────────────────────────────
ENVIA_API_TOKEN=              # Token de API (sandbox o producción)
ENVIA_API_URL=https://api-test.envia.com          # → https://api.envia.com en prod
ENVIA_QUERIES_URL=https://queries-test.envia.com  # → https://queries.envia.com en prod
ENVIA_WEBHOOK_SECRET=         # Secreto compartido para autenticar webhooks de tracking
ENVIA_WEBHOOK_ID=             # ID del webhook registrado en Envia (tras correr register-envia-webhook)
ENVIA_WEBHOOK_TYPE_ID=        # Tipo de webhook (obtenido al registrar)

# Carriers a cotizar (separados por coma). Sin esta variable usa defaults internos.
# ENVIA_CARRIERS=noventa9minutos,ups,dhl,fedex,estafeta,redpack,paquetexpress

# ── Bodega origen (para guías Envia) ──────────────────────────────────────────
MEDUSA_WAREHOUSE_LOCATION_ID= # ID del stock location en Medusa Admin
WAREHOUSE_PHONE=+525500000000
WAREHOUSE_STREET=Camino Real a San Lorenzo
WAREHOUSE_NUMBER=263
WAREHOUSE_CITY=Iztapalapa
WAREHOUSE_STATE=DIF
WAREHOUSE_POSTAL_CODE=09360

# ── Resend (Email transaccional) ──────────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@novapatch.care

# ── Slack (Notificaciones de operaciones) ──────────────────────────────────────
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# Opcional: si está vacío, las notificaciones Slack se omiten sin error

# ── Admin ──────────────────────────────────────────────────────────────────────
DISABLE_ADMIN=false           # Poner true en workers/instancias que no necesiten admin UI
```

### Variables Railway (sólo producción)

Railway inyecta automáticamente `DATABASE_URL` y `REDIS_URL` desde los plugins. Las variables adicionales de producción:

```bash
NODE_ENV=production
OPENPAY_SANDBOX=false
ENVIA_API_URL=https://api.envia.com
ENVIA_QUERIES_URL=https://queries.envia.com
STOREFRONT_URL=https://novapatch.care
```

---

## Comandos

### Desarrollo

```bash
npx medusa develop              # Servidor en :9000 con hot-reload
```

### Build y producción

```bash
npm run build                   # Compila TypeScript → .medusa/server/
npm start                       # Levanta el servidor compilado
```

### Base de datos

```bash
npx medusa db:migrate                                  # Aplica migraciones + sincroniza links
npx medusa db:generate subscriptionModuleService       # Genera nueva migración para el módulo Subscription
```

### Datos iniciales (one-time)

```bash
npx medusa exec ./src/scripts/seed-novapatch.ts        # Región MX, 6 productos con 4 tiers de precio
npx medusa user -e admin@novapatch.care -p Pass123!    # Crea usuario admin
npx medusa exec ./src/scripts/create-api-key.ts        # Genera publishable API key para el storefront
npx medusa exec ./src/scripts/setup-shipping.ts        # Configura opciones de envío en Medusa
```

### Envia.com (post-deploy, una sola vez)

```bash
npx medusa exec ./src/scripts/register-envia-webhook.ts   # Registra webhook de tracking en Envia
```

### Tests

```bash
npm run test:unit               # Tests unitarios (*.unit.spec.ts)
npm run test:integration:http   # Tests de integración HTTP
```

### Utilidades de debug

```bash
npx medusa exec ./src/scripts/diagnose.ts              # Diagnóstico general del sistema
npx medusa exec ./src/scripts/debug-order.ts           # Inspecciona una orden específica
npx medusa exec ./src/scripts/debug-envia-generate.ts  # Muestra payload Envia para una orden
npx medusa exec ./src/scripts/test-envia-subscriber.ts # Dispara manualmente el workflow de fulfillment
npx medusa exec ./src/scripts/test-slack-notification.ts # Prueba la notificación Slack
npx medusa exec ./src/scripts/reset-admin-password.ts  # Resetea contraseña de admin
npx medusa exec ./src/scripts/fix-mxn-prices.ts        # Corrige precios en MXN si hay drift
npx medusa exec ./src/scripts/update-prices.ts         # Actualiza precios de productos
npx medusa exec ./src/scripts/seed-argentina.ts        # Seed de región Argentina (multi-región)
```

---

## Estructura del proyecto

```
novabackend/
├── medusa-config.ts                          # Config Medusa: DB, Redis, módulos, CORS
├── nixpacks.toml                             # Config build para Railway (Nixpacks)
├── .env.template                             # Plantilla de variables de entorno
├── src/
│   ├── config/
│   │   └── warehouse.ts                      # Dirección de bodega origen (lee env vars)
│   ├── lib/
│   │   ├── envia-client.ts                   # HTTP wrapper Envia: tipos, retry, EnviaClient
│   │   ├── envia-mappers.ts                  # Medusa Address → EnviaAddress, buildPackages, splitStreetNumber
│   │   ├── redis.ts                          # Cliente Redis compartido (dedup, tracking keys)
│   │   ├── resend.ts                         # Helper sendEmail + renderEmail (React Email)
│   │   ├── slack-client.ts                   # HTTP wrapper Slack Incoming Webhook
│   │   └── slack-mappers.ts                  # Mapeo de órdenes a mensajes Slack formateados
│   ├── modules/
│   │   ├── subscription/                     # Módulo custom: Subscription + SubscriptionOrder
│   │   │   ├── models/subscription.ts        # DML: id, status, interval_days, next_billing_date, original_order_id
│   │   │   ├── models/subscription-order.ts  # DML: subscription_id, order_id, cycle_number
│   │   │   ├── service.ts                    # Extiende MedusaService (CRUD automático)
│   │   │   ├── migrations/                   # Migraciones generadas automáticamente
│   │   │   └── index.ts                      # SUBSCRIPTION_MODULE = "subscriptionModuleService"
│   │   └── openpay-payment/                  # Payment Provider Openpay
│   │       ├── openpay-client.ts             # HTTP wrapper (fetch nativo, Basic Auth)
│   │       ├── service.ts                    # AbstractPaymentProvider: authorize/capture/refund/cancel
│   │       └── index.ts                      # ModuleProvider(Modules.PAYMENT, { id: "openpay" })
│   ├── links/                                # Links entre módulos (Remote Links)
│   │   ├── subscription-customer.ts          # Customer ↔ Subscription (isList)
│   │   ├── subscription-product-variant.ts   # Subscription ↔ ProductVariant
│   │   ├── subscription-order.ts             # Subscription → Order original (readOnly)
│   │   └── subscription-order-order.ts       # SubscriptionOrder → Order (readOnly)
│   ├── workflows/
│   │   ├── create-subscriptions-from-order/  # Crea Subscriptions al completar una orden
│   │   │   ├── index.ts
│   │   │   └── steps/create-subscriptions.ts
│   │   ├── envia-create-fulfillment/         # Cotiza, genera guía, registra fulfillment
│   │   │   ├── index.ts                      # Orquesta 3 steps encadenados
│   │   │   └── steps/
│   │   │       ├── fetch-order.ts            # Step 1: obtiene orden con dirección e items
│   │   │       ├── generate-label.ts         # Step 2: cotiza en paralelo, genera guía + fallback
│   │   │       │                             #   compensation: cancela guía en Envia si step 3 falla
│   │   │       └── create-fulfillment.ts     # Step 3: registra fulfillment en Medusa con tracking
│   │   ├── process-billing-cycle/            # Ciclo de cobro recurrente para una suscripción
│   │   │   ├── index.ts
│   │   │   └── steps/process-billing.ts     # Cobro Openpay → crea orden → avanza billing date
│   │   ├── pause-subscription/               # active → paused
│   │   ├── resume-subscription/              # paused → active (recalcula next_billing_date)
│   │   ├── cancel-subscription/              # any → canceled
│   │   └── update-subscription-frequency/   # Actualiza interval_days (30|60|90)
│   ├── subscribers/                          # Manejadores de eventos del Event Bus
│   │   ├── envia-fulfillment.ts             # order.payment_captured → envia-create-fulfillment
│   │   ├── order-placed.ts                  # order.placed → crea Subscriptions
│   │   ├── order-confirmation-email.ts      # order.placed → email de confirmación
│   │   ├── order-shipped-email.ts           # novapatch.envia.in_transit → email "tu pedido va en camino"
│   │   ├── subscription-welcome-email.ts    # subscription.created → email de bienvenida
│   │   ├── subscription-renewed-email.ts    # subscription.renewed → recibo de cobro
│   │   └── subscription-payment-failed-email.ts  # subscription.payment_failed → alerta de pago fallido
│   ├── jobs/
│   │   └── process-daily-subscriptions.ts  # Cron diario 00:00 CST — cobra suscripciones activas
│   ├── api/
│   │   ├── middlewares.ts                   # Clerk JWT en /store/me/*, CORS en /promotions, /shipping-options
│   │   ├── promotions/route.ts              # GET /promotions?code=XXX — valida cupón
│   │   ├── shipping-options/route.ts        # GET /shipping-options — lista opciones con precios MXN
│   │   ├── webhooks/envia/route.ts          # POST /webhooks/envia — eventos de tracking
│   │   └── store/
│   │       ├── carts/[id]/
│   │       │   ├── complete/route.ts        # POST — tokeniza, cobra con 3DS, completa carrito
│   │       │   ├── complete-3ds/route.ts    # POST — finaliza orden tras autenticación 3DS
│   │       │   └── payment-sessions/route.ts # POST — crea sesión de pago Openpay
│   │       └── me/                          # Rutas protegidas por Clerk JWT
│   │           ├── customer/route.ts        # GET — obtiene o crea el cliente Medusa
│   │           ├── orders/route.ts          # GET — lista órdenes del usuario
│   │           ├── subscriptions/route.ts   # GET — lista suscripciones del usuario
│   │           ├── subscriptions/[id]/pause/      # POST — pausar suscripción
│   │           ├── subscriptions/[id]/resume/     # POST — reanudar suscripción
│   │           ├── subscriptions/[id]/cancel/     # POST — cancelar suscripción
│   │           ├── subscriptions/[id]/frequency/  # POST — cambiar frecuencia
│   │           ├── payment-methods/route.ts       # GET — tarjetas del vault Openpay
│   │           └── payment-methods/default/       # POST — cambiar tarjeta por defecto
│   ├── admin/
│   │   └── routes/influencers/
│   │       ├── page.tsx                     # Ruta admin /a/influencers
│   │       ├── types.ts                     # Tipos InfluencerCampaign, parseInfluencerCampaign
│   │       └── components/
│   │           ├── influencer-table.tsx     # Tabla de influencers con métricas
│   │           ├── new-influencer-modal.tsx # Modal para crear código de influencer
│   │           └── influencer-detail-drawer.tsx  # Drawer con detalle de campañas y usos
│   ├── emails/                              # Plantillas React Email
│   │   ├── OrderConfirmation.tsx
│   │   ├── OrderShipped.tsx
│   │   ├── OrderDelivered.tsx
│   │   ├── OrderDeliveryFailed.tsx
│   │   ├── SubscriptionWelcome.tsx
│   │   ├── SubscriptionRenewed.tsx
│   │   ├── SubscriptionPaymentFailed.tsx
│   │   └── components/                     # Componentes compartidos (header, footer, botones)
│   └── scripts/                            # Scripts de administración (ver sección Comandos)
└── src/__tests__/                          # Tests unitarios e integración
    ├── api/
    ├── emails/
    ├── jobs/
    ├── lib/
    ├── subscribers/
    └── workflows/
```

---

## Modelo de dominio

### Productos

6 SKUs de parches vitamínicos. Orden canónico de display:

```
["energy", "sleep", "glow", "shield", "zen", "woman"]
```

Cada SKU tiene 4 variantes de precio:

| Variante | Descuento | `interval_days` | `metadata.is_subscription` |
|----------|-----------|-----------------|---------------------------|
| Única vez | — | — | `false` |
| Mensual | 20% | `30` | `true` |
| Bimestral | 15% | `60` | `true` |
| Trimestral | 10% | `90` | `true` |

### Entidades custom

#### Subscription

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | PK |
| `status` | enum | `active` \| `paused` \| `canceled` \| `past_due` \| `delayed_out_of_stock` |
| `interval_days` | number | `30` \| `60` \| `90` |
| `next_billing_date` | Date | Próxima fecha de cobro |
| `original_order_id` | string | FK → Order (orden que originó la suscripción) |
| `metadata` | json | Datos adicionales (product_title, unit_price, quantity) |

**Estados de suscripción:**
- `active` — se cobra en la próxima `next_billing_date`
- `paused` — pausada por el usuario, no se cobra
- `canceled` — cancelada definitivamente
- `past_due` — el último cobro falló; requiere actualización de tarjeta
- `delayed_out_of_stock` — sin stock; el cron reintenta diariamente sin cobrar ni cancelar

#### SubscriptionOrder

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | PK |
| `subscription_id` | string | FK → Subscription |
| `order_id` | string | FK → Order (cada ciclo genera una orden) |
| `cycle_number` | number | Número de ciclo (1, 2, 3…) |

### Links entre módulos

| Link | Tipo | Dirección |
|------|------|-----------|
| `subscription-customer` | `isList` | Customer ↔ Subscription (1:N) |
| `subscription-product-variant` | stored | Subscription ↔ ProductVariant |
| `subscription-order` | readOnly | Subscription → Order (original_order_id) |
| `subscription-order-order` | readOnly | SubscriptionOrder → Order (order_id) |

### Metadata en entidades nativas de Medusa

| Entidad | Campo | Valor |
|---------|-------|-------|
| Customer | `metadata.openpay_customer_id` | ID de cliente en vault Openpay |
| Customer | `metadata.openpay_default_card_id` | ID de tarjeta por defecto |
| Customer | `metadata.clerk_user_id` | ID de usuario en Clerk |
| LineItem | `metadata.is_subscription` | `true` \| `false` |
| LineItem | `metadata.interval_days` | `30` \| `60` \| `90` |
| LineItem | `metadata.discount_percentage` | `20` \| `15` \| `10` |
| Fulfillment | `metadata.envia_shipment_id` | ID del envío en Envia |
| Fulfillment | `metadata.carrier` | Carrier seleccionado (ej. `dhl`) |
| Fulfillment | `metadata.envia_label_url` | URL del PDF de guía |
| Fulfillment | `metadata.order_id` | FK a la Order de Medusa (para webhook de tracking) |

---

## API — Referencia completa

### Catálogo (público)

```
GET  /store/products                    Lista productos con precios por región
                                        Query: ?region_id=reg_xxx
GET  /store/variants/:id                Detalle de una variante con precio
```

### Carrito (público)

```
POST /store/carts
     Body: { region_id }
     → Crea un carrito vacío

POST /store/carts/:id/line-items
     Body (única vez): { variant_id, quantity }
     Body (suscripción): {
       variant_id,
       quantity,
       metadata: { is_subscription: true, interval_days: 30|60|90, discount_percentage: 20|15|10 }
     }

POST /store/carts/:id/payment-sessions
     → Inicializa la sesión de pago Openpay para el carrito

POST /store/carts/:id/complete
     Body: { openpay_token_id, device_session_id, email? }
     → Tokeniza tarjeta, cobra con 3DS, completa orden
     Respuesta éxito (cobro directo): orden Medusa completa
     Respuesta 3DS requerido: { type: "redirect", redirect_url: "https://openpay.mx/3ds/..." }

POST /store/carts/:id/complete-3ds
     Body: { openpay_transaction_id }
     → Finaliza la orden tras autenticación 3DS exitosa en banco
     Precondición: el cobro Openpay debe tener status "completed"
```

### Suscripciones (requiere `Authorization: Bearer <clerk_jwt>`)

```
GET  /store/me/subscriptions
     → Lista todas las suscripciones del usuario autenticado
     Respuesta: { subscriptions: [ { id, status, interval_days, next_delivery_at,
                                      product_title, variant_id, unit_price, quantity, created_at } ] }

POST /store/me/subscriptions/:id/pause
     → Cambia status a "paused"

POST /store/me/subscriptions/:id/resume
     → Cambia status a "active" y recalcula next_billing_date
       (next_billing_date = now + interval_days)

POST /store/me/subscriptions/:id/cancel
     → Cambia status a "canceled" (irreversible)

POST /store/me/subscriptions/:id/frequency
     Body: { interval_days: 30|60|90 }
     → Actualiza la frecuencia de cobro y recalcula next_billing_date
```

### Métodos de pago (requiere `Authorization: Bearer <clerk_jwt>`)

```
GET  /store/me/payment-methods
     → Lista tarjetas tokenizadas del vault Openpay del cliente

POST /store/me/payment-methods/default
     Body: { openpay_token_id }
     → Tokeniza nueva tarjeta y la establece como default en el vault
```

### Cliente (requiere `Authorization: Bearer <clerk_jwt>`)

```
GET  /store/me/customer
     → Retorna el cliente Medusa vinculado al JWT de Clerk
       Si no existe, lo crea automáticamente con email del JWT
     Respuesta: { customer: { id, email, first_name, last_name } }
```

### Órdenes (requiere `Authorization: Bearer <clerk_jwt>`)

```
GET  /store/me/orders
     → Lista todas las órdenes del usuario autenticado
     Respuesta: { orders: [ { id, display_id, status, total, created_at, items } ] }
```

### Promotions / Cupones (público, con CORS de storefront)

```
GET  /promotions?code=PROMO20
     → Valida un código de descuento
     Respuesta éxito: { promotion: { id, code, status, discount_value, type } }
     Respuesta error: 404 { message: "Cupón inválido o expirado" }
```

> **Nota técnica:** Esta ruta está fuera de `/store/*` para evitar el chequeo obligatorio de `x-publishable-api-key` que Medusa aplica a todas las rutas de tienda. El CORS se configura con el mismo origen que el storefront (`STORE_CORS`).

### Opciones de envío (público, con CORS de storefront)

```
GET  /shipping-options
     → Lista las opciones de envío disponibles con sus precios en MXN
     Respuesta: { shipping_options: [ { id, name, price_type, amount, currency_code } ] }
```

### Webhooks (autenticado por query param `?secret=`)

```
POST /webhooks/envia?secret=<ENVIA_WEBHOOK_SECRET>
     Body: { trackingNumber, status, carrierName?, events? }
     Status values: "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returned"
     → Actualiza metadata del fulfillment y dispara emails al cliente
     → Responde 200 inmediatamente; procesamiento es asíncrono (< 5s requisito Envia)
```

---

## Flujo de pago (triangular PCI-DSS)

Los datos de tarjeta **nunca** tocan servidores de Novapatch:

```
1. Browser → Openpay SDK  : cardData → tok_XXX + deviceSessionId
                            (tokenización PCI-DSS en cliente)

2. Browser → Medusa       : POST /store/carts/:id/complete
                            Body: { openpay_token_id: "tok_XXX", device_session_id }

3. Medusa  → Openpay API  : createCustomer (si no existe) → openpay_customer_id
4. Medusa  → Openpay API  : storeCard(openpay_customer_id, { token_id: tok_XXX }) → card_id
5. Medusa  → Openpay API  : chargeCustomerCard(openpay_customer_id, { source_id: card_id, use_3d_secure: true })
                            → charge { id, status }

6a. status = "completed"  : Cobro directo → completeCartWorkflow → orden creada
6b. status = "charge_pending" + payment_method.url  → 3DS requerido (ver sección 3DS)
```

El `openpay_customer_id` se persiste en `customer.metadata` para reutilizarlo en compras futuras.

---

## Flujo 3D Secure (3DS)

Cuando el banco del cliente requiere autenticación adicional:

```
1. POST /store/carts/:id/complete
   → Openpay responde { status: "charge_pending", payment_method.url: "https://..." }
   → Medusa responde al storefront: { type: "redirect", redirect_url: "https://openpay.mx/3ds/..." }

2. Browser redirige al usuario a la URL de 3DS del banco

3. Banco autentica → redirige a: ${STOREFRONT_URL}/checkout/3ds-return?id=<openpay_transaction_id>

4. Storefront llama: POST /store/carts/:id/complete-3ds
   Body: { openpay_transaction_id }
   → Medusa verifica con Openpay que charge.status === "completed"
   → Corre completeCartWorkflow → orden creada
```

**Requisito de configuración:** `STOREFRONT_URL` debe estar definido con la URL pública del storefront para que el redirect después de 3DS funcione correctamente.

---

## Autenticación (Clerk JWT)

El middleware en [`src/api/middlewares.ts`](src/api/middlewares.ts) protege todas las rutas `/store/me/*`.

**Flujo:**
1. Frontend obtiene JWT via `useAuth().getToken()` (Clerk SDK)
2. Frontend envía `Authorization: Bearer <jwt>` en cada request
3. Middleware verifica el JWT con la API de Clerk usando `CLERK_SECRET_KEY`
4. Si válido: obtiene el email del usuario via `clerk.users.getUser(userId)` e inyecta `req.clerk_email`
5. Las rutas usan `req.clerk_email` para buscar o crear el cliente Medusa correspondiente

**Bypass de desarrollo:** Si `CLERK_SECRET_KEY` no está definido (y `NODE_ENV !== "production"`), cualquier header `Authorization: Bearer <cualquier-valor>` pasa con `req.clerk_email = dev@novapatch.care`. Esto permite probar rutas protegidas localmente sin cuenta de Clerk.

**En producción:** Si `CLERK_SECRET_KEY` está vacío, el servidor responde `503 Authentication service not configured`.

---

## Flujo de envíos (Envia.com)

Al capturarse el pago de una orden (`order.payment_captured`), el subscriber `envia-fulfillment` dispara el workflow `envia-create-fulfillment`:

```
Step 1: fetch-order
  → Obtiene la orden de Medusa con shipping_address, items, región

Step 2: generate-label
  → Cotiza TODOS los carriers configurados en paralelo (Promise.allSettled)
  → Ordena resultados por precio ascendente
  → Intenta generar guía con el carrier más barato
  → Si falla (carrier no cubre la ruta), prueba el siguiente automáticamente
  → Devuelve: { trackingNumber, trackUrl, labelUrl, carrier, shipmentId }
  [Compensation]: si step 3 falla → cancela la guía en Envia (void shipment)

Step 3: create-fulfillment
  → Registra el fulfillment en Medusa con:
    - tracking_number, tracking_url
    - metadata: { envia_shipment_id, carrier, envia_label_url, order_id }
  → Indexa tracking_number en Redis para lookups O(1) en el webhook
```

**Idempotencia:** El subscriber verifica si ya existe un fulfillment para la orden antes de procesar. Si ya existe, la operación es un no-op.

**Carriers validados (sandbox, origen Iztapalapa CDMX):**

| Carrier | Precio aprox. sandbox | Servicio |
|---------|----------------------|---------|
| noventa9minutos | ~9 MXN | same_day (solo CDMX) |
| ups | ~12 MXN | saver |
| estafeta | ~229 MXN | express |
| dhl | ~305 MXN | ground |
| fedex | ~565 MXN | ground |

> Los precios de sandbox no reflejan tarifas reales. Validar en producción.

**Actualizar carriers en producción sin redeploy:**
```bash
# En Railway > Variables del servicio:
ENVIA_CARRIERS=dhl,fedex,estafeta,redpack,paquetexpress
```

---

## Billing recurrente (Cron job)

Archivo: [`src/jobs/process-daily-subscriptions.ts`](src/jobs/process-daily-subscriptions.ts)

**Schedule:** `0 6 * * *` (06:00 UTC = 00:00 CST, medianoche en México)

**Lógica por cada suscripción activa con `next_billing_date <= hoy`:**

```
1. Consulta DB: status = "active" AND next_billing_date <= now

2. Para cada suscripción (concurrencia = 5 en paralelo):

   a. Verifica stock de la variante
      → Sin stock: status = "delayed_out_of_stock" (no cancela, reintenta mañana)

   b. Obtiene la orden original para extraer:
      - Precio y cantidad del ítem de suscripción
      - Dirección de envío
      - openpay_customer_id del cliente

   c. Cobra con Openpay (tarjeta por defecto del vault)
      → Falla: status = "past_due", emite subscription.payment_failed

   d. Cobro OK:
      - Crea nueva Order en Medusa
      - Crea SubscriptionOrder (cycle_number++)
      - Avanza next_billing_date += interval_days
      - Emite order.payment_captured → dispara workflow de fulfillment Envia
      - Emite subscription.renewed → email de recibo
```

---

## Notificaciones por email

Los subscribers en `src/subscribers/` escuchan eventos del Event Bus y envían emails via Resend:

| Subscriber | Evento | Plantilla | Descripción |
|-----------|--------|-----------|-------------|
| `order-confirmation-email` | `order.placed` | `OrderConfirmation` | Confirmación de compra |
| `order-shipped-email` | `novapatch.envia.in_transit` | `OrderShipped` | Pedido en camino (con tracking) |
| `subscription-welcome-email` | `subscription.created` | `SubscriptionWelcome` | Bienvenida + calendario de cobros |
| `subscription-renewed-email` | `subscription.renewed` | `SubscriptionRenewed` | Recibo de cobro recurrente |
| `subscription-payment-failed-email` | `subscription.payment_failed` | `SubscriptionPaymentFailed` | Alerta con link para actualizar tarjeta |

**Webhook de Envia → email de entrega:**

El webhook en `POST /webhooks/envia` maneja adicionalmente:
- `status: "delivered"` → email `OrderDelivered`
- `status: "failed"` o `"returned"` → email `OrderDeliveryFailed` con razón del fallo

---

## Notificaciones Slack (operaciones)

El cliente Slack en [`src/lib/slack-client.ts`](src/lib/slack-client.ts) envía notificaciones al canal de operaciones mediante un Incoming Webhook.

**Eventos que generan notificación Slack:**
- Nueva guía generada por Envia (con tracking number, carrier, precio)
- Errores críticos en el workflow de fulfillment

**Configuración:** `SLACK_WEBHOOK_URL` en variables de entorno. Si está vacío, las notificaciones se omiten sin error (no bloquean el flujo principal).

---

## Webhooks entrantes

### Envia.com — `POST /webhooks/envia`

**Autenticación:** query param `?secret=<ENVIA_WEBHOOK_SECRET>`

**Deduplicación:**
- Primero intenta Redis (`SET NX EX 86400`): si la key ya existe, el evento es duplicado y se descarta
- Fallback a Map en memoria si Redis no está disponible

**Procesamiento asíncrono:** el handler responde `200 { received: true }` inmediatamente y procesa con `setImmediate()`. Esto garantiza respuesta < 5s (requisito de Envia).

**Eventos manejados:**

| Status Envia | Acción |
|-------------|--------|
| `in_transit` | Emite evento interno `novapatch.envia.in_transit` → subscriber envía email "tu pedido va en camino" |
| `delivered` | Envía email `OrderDelivered` al cliente |
| `failed` | Envía email `OrderDeliveryFailed` al cliente |
| `returned` | Envía email `OrderDeliveryFailed` (variante devolución) al cliente |

**Registro del webhook (una sola vez post-deploy):**
```bash
npx medusa exec ./src/scripts/register-envia-webhook.ts
# Guarda ENVIA_WEBHOOK_ID y ENVIA_WEBHOOK_TYPE_ID en las variables del proyecto
```

---

## Admin: Gestión de influencers

Ruta en Medusa Admin: **`/a/influencers`**

Archivo: [`src/admin/routes/influencers/page.tsx`](src/admin/routes/influencers/page.tsx)

**Funcionalidad:**
- Tabla de todos los influencers con sus códigos de descuento, número de usos y revenue generado
- Crear nuevo código de influencer con nombre, handle (@) y % de descuento
- Ver detalle de campañas individuales con breakdown de uso

**Convención de nombres:** las campañas de influencer siguen el formato `INF|NombreInfluencer|@handle` para identificación automática. El helper `parseInfluencerCampaign()` extrae nombre y handle del campo `campaign.name`.

---

## Descuentos y cupones

Medusa gestiona los cupones como `Promotions`. La API pública para validación es:

```
GET /promotions?code=PROMO20
```

Los cupones de influencer se crean desde la UI de Admin (`/a/influencers`) con campaña `INF|Nombre|@handle`. Los cupones generales se crean desde Medusa Admin en `/app/promotions`.

---

## Testing

### Estructura

```
src/__tests__/
├── api/
│   ├── middlewares.unit.spec.ts           # Clerk middleware (bypass, token válido, inválido)
│   ├── webhooks-envia.unit.spec.ts        # Webhook Envia (autenticación, dedup)
│   └── envia-webhook-process-event.unit.spec.ts  # processEvent (in_transit, delivered, failed)
├── emails/
│   └── email-templates.unit.spec.ts      # Renderizado de plantillas React Email
├── jobs/
│   └── process-daily-subscriptions.unit.spec.ts  # Cron job (batching, concurrency)
├── lib/
│   ├── envia-client.unit.spec.ts         # EnviaClient (retry, errores de aplicación)
│   └── envia-mappers.unit.spec.ts        # Mappers de dirección y paquetes
├── subscribers/
│   └── envia-fulfillment.unit.spec.ts    # Subscriber de fulfillment (idempotencia)
└── workflows/
    ├── create-subscriptions-from-order/  # Creación de suscripciones al completar orden
    ├── envia-fulfillment.unit.spec.ts    # Workflow completo de Envia
    ├── notify-slack.unit.spec.ts         # Notificaciones Slack
    ├── process-billing.unit.spec.ts      # Ciclo de cobro recurrente
    └── subscription-state-machine.unit.spec.ts  # Transiciones de estado (pause/resume/cancel)
```

### Comandos

```bash
npm run test:unit                 # Corre todos los tests unitarios
npm run test:integration:http     # Tests de integración HTTP (requiere DB activa)
```

---

## Despliegue en Railway

### Servicios requeridos

| Servicio | Tipo | Notas |
|----------|------|-------|
| PostgreSQL | Plugin nativo Railway | `DATABASE_URL` se inyecta automáticamente |
| Redis | Plugin nativo Railway | `REDIS_URL` se inyecta automáticamente |
| novabackend | Servicio GitHub | Node.js, build con Nixpacks |

### Configuración de build (nixpacks.toml)

```toml
[phases.install]
cmds = ["npm ci"]
cache_directories = ["/root/.npm"]

[start]
cmd = "npm run build && npx medusa db:migrate && npm start"
```

Las migraciones corren automáticamente en cada deploy. Medusa es idempotente — si las migraciones ya están aplicadas, no hace nada.

### Variables de entorno en Railway

Además de las variables de desarrollo, configurar en Railway:

```bash
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
STOREFRONT_URL=https://novapatch.care
OPENPAY_SANDBOX=false
ENVIA_API_URL=https://api.envia.com
ENVIA_QUERIES_URL=https://queries.envia.com
ENVIA_API_TOKEN=<token-produccion>
ENVIA_CARRIERS=noventa9minutos,ups,dhl,fedex,estafeta,redpack
MEDUSA_WAREHOUSE_LOCATION_ID=<id-del-stock-location>
ENVIA_WEBHOOK_SECRET=<secreto-aleatorio-seguro>
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@novapatch.care
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DISABLE_ADMIN=false
```

### Checklist post-deploy (primera vez)

```bash
# 1. Crear admin user
npx medusa user -e admin@novapatch.care -p <contraseña-segura>

# 2. Correr seed (región MX, 6 productos)
npx medusa exec ./src/scripts/seed-novapatch.ts

# 3. Crear API key para el storefront
npx medusa exec ./src/scripts/create-api-key.ts

# 4. Configurar opciones de envío
npx medusa exec ./src/scripts/setup-shipping.ts

# 5. Registrar webhook de Envia
npx medusa exec ./src/scripts/register-envia-webhook.ts
# → Guarda los IDs devueltos en ENVIA_WEBHOOK_ID y ENVIA_WEBHOOK_TYPE_ID
```

---

## Integraciones — resumen

| Servicio | Rol | Estado |
|----------|-----|--------|
| **Openpay** | Vault de tarjetas, tokenización, cobros con 3DS (México) | ✅ Implementado |
| **Clerk** | Validación de JWT en rutas `/store/me/*`, contexto de cliente | ✅ Implementado |
| **Envia.com** | Cotización multi-carrier, generación de guías, tracking por webhook | ✅ Implementado |
| **Resend** | Emails transaccionales via Event Bus + React Email | ✅ Implementado |
| **Slack** | Notificaciones de operaciones (fulfillment, errores) | ✅ Implementado |

---

## Estado de desarrollo (fases)

### Phase 1 — Fundación ✅
- [x] Módulo custom `Subscription` con DML (status, interval_days, next_billing_date)
- [x] Links entre módulos (Customer ↔ Subscription, Subscription ↔ ProductVariant, etc.)
- [x] Workflows: pause / resume / cancel / update-frequency (con compensation)
- [x] Rutas `/store/me/subscriptions/*`
- [x] Middleware Clerk JWT en `/store/me/*`
- [x] Seed de 6 productos con 4 tiers de precio

### Phase 2 — Pagos ✅
- [x] Módulo Openpay (`OpenpayClient` + `AbstractPaymentProvider`)
- [x] Override `POST /store/carts/:id/complete` con cobro server-to-server
- [x] Soporte 3DS: `POST /store/carts/:id/complete-3ds`
- [x] Subscriber `order.placed` → crea Subscriptions
- [x] Rutas de métodos de pago (`/store/me/payment-methods`)
- [x] Ruta `/store/me/customer` (get-or-create)
- [x] Ruta `/store/me/orders`

### Phase 2.5 — Envíos ✅
- [x] `EnviaClient` HTTP wrapper con retry y detección de errores de aplicación
- [x] Mappers: `mapAddress()` (normalización estados MX), `buildPackages()`, `splitStreetNumber()`
- [x] Workflow `envia-create-fulfillment` (3 steps + compensation automática)
- [x] Cotización en paralelo + fallback de carrier
- [x] Carrier list configurable via `ENVIA_CARRIERS` sin redeploy
- [x] Webhook `POST /webhooks/envia` con dedup Redis
- [x] Notificaciones Slack en fulfillment

### Phase 3 — Billing recurrente y notificaciones ✅
- [x] Cron job `ProcessDailySubscriptions` (diario 00:00 CST)
- [x] Emails transaccionales (confirmación, envío, entrega, fallo de entrega)
- [x] Emails de suscripción (bienvenida, renovación, pago fallido)
- [x] Descuentos / cupones (`GET /promotions?code=`)
- [x] Admin de influencers (`/a/influencers`)

### Roadmap
- [ ] Región Argentina activa con gateway de pagos local
- [ ] Widget de suscripciones en detalle de cliente (Medusa Admin)
- [ ] Tabla global `/a/subscriptions` con filtros y exportación CSV
- [ ] Email `subscription.upcoming_charge` (recordatorio 3 días antes)
- [ ] Multi-región: Brasil, Colombia, Chile
