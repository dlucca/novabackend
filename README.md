# Novapatch Backend

Motor de e-commerce headless para la plataforma de parches vitamínicos por suscripción Novapatch. Construido sobre **Medusa.js v2** con soporte multi-región (México como mercado inicial; Brasil, Argentina, Colombia y Chile en roadmap).

---

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | Medusa.js v2.13.1 (Node.js / TypeScript) |
| Base de datos | PostgreSQL |
| Cache y colas | Redis |
| API | REST headless — `http://localhost:9000` |
| Auth | Clerk (JWT Bearer en rutas `/store/me/*`) |
| Pagos | Openpay (México — tokenización server-to-server) |
| Envíos | Envia.com (cotización multi-carrier, guías, tracking) |
| Email transaccional | Resend + React Email (Phase 3) |

---

## Requisitos

- Node.js >= 20
- PostgreSQL
- Redis
- npm >= 10

---

## Variables de entorno

Crear `.env` en la raíz del proyecto:

```bash
# ── Base de datos y cache ──────────────────────────────────────────────────────
DATABASE_URL=postgres://user:password@localhost:5432/novabackend
REDIS_URL=redis://localhost:6379

# ── Seguridad ──────────────────────────────────────────────────────────────────
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret

# ── CORS ───────────────────────────────────────────────────────────────────────
STORE_CORS=http://localhost:3000
ADMIN_CORS=http://localhost:9000
AUTH_CORS=http://localhost:9000,http://localhost:3000

# ── Clerk (Auth) ───────────────────────────────────────────────────────────────
CLERK_SECRET_KEY=sk_test_...
# Dejar vacío en desarrollo local activa el bypass: clerk_email = dev@novapatch.mx

# ── Openpay (Pagos México) ─────────────────────────────────────────────────────
OPENPAY_MERCHANT_ID=
OPENPAY_PRIVATE_KEY=
OPENPAY_SANDBOX=true     # false en producción

# ── Envia.com (Envíos) ─────────────────────────────────────────────────────────
ENVIA_API_TOKEN=          # Token de API (sandbox o producción)
ENVIA_API_URL=https://api-test.envia.com          # https://api.envia.com en prod
ENVIA_QUERIES_URL=https://queries-test.envia.com  # https://queries.envia.com en prod

# Carriers a cotizar (separados por coma). Sin esta variable usa los defaults.
# Actualizar en producción según los carriers activos en tu cuenta de Envia.
# ENVIA_CARRIERS=noventa9minutos,ups,dhl,fedex,estafeta,redpack,paquetexpress

# ── Bodega origen (para guías Envia) ──────────────────────────────────────────
MEDUSA_WAREHOUSE_LOCATION_ID=   # ID del stock location en Medusa Admin
WAREHOUSE_PHONE=+525500000000
WAREHOUSE_STREET=Camino Real a San Lorenzo
WAREHOUSE_NUMBER=263
WAREHOUSE_CITY=Iztapalapa
WAREHOUSE_STATE=DIF
WAREHOUSE_POSTAL_CODE=09360
```

---

## Comandos

```bash
# Desarrollo
npx medusa develop              # Servidor en :9000 con hot-reload

# Build y producción
npm run build                   # Compila TypeScript → .medusa/server/
npm start                       # Levanta el servidor compilado

# Base de datos
npx medusa db:migrate           # Aplica migraciones + sincroniza links
npx medusa db:generate subscriptionModuleService  # Genera nueva migración

# Datos iniciales
npx medusa exec ./src/scripts/seed-novapatch.ts   # Carga 6 productos con 4 tiers de precio
npx medusa user -e admin@novapatch.mx -p novapatch123  # Crea usuario admin

# Envia
npx medusa exec ./src/scripts/register-envia-webhook.ts  # Registra webhook de tracking en Envia

# Tests
npm run test:unit               # Tests unitarios (src/**/__tests__/**/*.unit.spec.ts)
npm run test:integration:http   # Tests de integración HTTP (integration-tests/http/)
```

---

## Estructura del proyecto

```
src/
├── config/
│   └── warehouse.ts                           # Dirección de bodega origen (lee de env vars)
├── lib/
│   ├── envia-client.ts                        # HTTP wrapper Envia: tipos, retry, EnviaClient
│   └── envia-mappers.ts                       # Mapea Medusa Address → EnviaAddress, construye paquetes
├── modules/
│   ├── subscription/                          # Módulo custom: Subscription + SubscriptionOrder
│   │   ├── models/subscription.ts             # DML: status, interval_days, next_billing_date
│   │   ├── models/subscription-order.ts       # DML: cycle_number
│   │   ├── service.ts                         # Extiende MedusaService (CRUD automático)
│   │   └── index.ts                           # SUBSCRIPTION_MODULE = "subscriptionModuleService"
│   └── openpay-payment/                       # Provider de pagos Openpay
│       ├── openpay-client.ts                  # HTTP wrapper (fetch nativo, auth Basic)
│       ├── service.ts                         # AbstractPaymentProvider
│       └── index.ts                           # ModuleProvider(Modules.PAYMENT, ...)
├── links/                                     # Links entre módulos
│   ├── subscription-customer.ts              # Customer ↔ Subscription (isList)
│   ├── subscription-product-variant.ts       # Subscription ↔ ProductVariant
│   ├── subscription-order.ts                 # Subscription → Order (readOnly)
│   └── subscription-order-order.ts           # SubscriptionOrder → Order (readOnly)
├── workflows/
│   ├── envia-create-fulfillment/             # Cotiza carriers, genera guía, crea fulfillment en Medusa
│   │   ├── index.ts                          # Workflow principal (3 steps encadenados)
│   │   └── steps/
│   │       ├── fetch-order.ts                # Step 1: obtiene la orden con dirección e items
│   │       ├── generate-label.ts             # Step 2: cotiza en paralelo, genera guía con fallback
│   │       │                                 #   ↳ compensation: cancela la guía en Envia si falla step 3
│   │       └── create-fulfillment.ts         # Step 3: registra el fulfillment en Medusa con tracking
│   ├── create-subscriptions-from-order/      # Crea Subscriptions al completar una orden
│   ├── pause-subscription/                   # active → paused
│   ├── resume-subscription/                  # paused → active (recalcula next_billing_date)
│   ├── cancel-subscription/                  # any → canceled
│   └── update-subscription-frequency/        # Actualiza interval_days (30|60|90)
├── subscribers/
│   ├── envia-fulfillment.ts                  # order.payment_captured → dispara envia-create-fulfillment
│   └── order-placed.ts                       # order.placed → crea Subscriptions
├── api/
│   ├── middlewares.ts                         # Clerk JWT en /store/me/*
│   ├── webhooks/
│   │   └── envia/route.ts                    # POST /webhooks/envia — recibe eventos de tracking
│   └── store/
│       ├── carts/[id]/complete/route.ts       # POST: inyecta openpay_token_id y completa carrito
│       └── me/
│           ├── subscriptions/route.ts         # GET: lista suscripciones del usuario
│           ├── subscriptions/[id]/pause/      # POST: pausar
│           ├── subscriptions/[id]/resume/     # POST: reanudar
│           ├── subscriptions/[id]/cancel/     # POST: cancelar
│           ├── subscriptions/[id]/frequency/  # POST: cambiar frecuencia
│           ├── payment-methods/route.ts       # GET: tarjetas del vault Openpay
│           └── payment-methods/default/       # POST: cambiar tarjeta por defecto
└── scripts/
    ├── seed-novapatch.ts                      # Seed: región MX, 6 productos, 4 precios c/u
    ├── register-envia-webhook.ts              # Registra webhook de tracking en Envia (correr 1 vez)
    ├── test-envia-subscriber.ts              # Prueba el workflow de fulfillment con una orden real
    └── debug-envia-generate.ts               # Muestra el payload completo que se envía a Envia
```

---

## Modelo de dominio

### Productos

6 SKUs: `energy`, `sleep`, `glow`, `shield`, `zen`, `woman`. Cada uno con 4 variantes de precio:

| Variante | Descuento | `interval_days` |
|----------|-----------|-----------------|
| Única vez | — | — |
| Mensual | 20% | 30 |
| Bimestral | 15% | 60 |
| Trimestral | 10% | 90 |

### Entidades custom

**Subscription**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | PK |
| `status` | enum | `active` \| `paused` \| `canceled` \| `past_due` \| `delayed_out_of_stock` |
| `interval_days` | number | `30` \| `60` \| `90` |
| `next_billing_date` | Date | Próxima fecha de cobro |
| `original_order_id` | string | FK → Order (orden original) |

**SubscriptionOrder**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `subscription_id` | string | FK → Subscription |
| `order_id` | string | FK → Order (cada ciclo) |
| `cycle_number` | number | Número de ciclo (1, 2, 3…) |

### Metadata en entidades nativas

| Entidad | Campo | Valor |
|---------|-------|-------|
| Customer | `metadata.openpay_customer_id` | ID de cliente en vault Openpay |
| Customer | `metadata.openpay_default_card_id` | ID de tarjeta por defecto |
| LineItem | `metadata.is_subscription` | `true` \| `false` |
| LineItem | `metadata.interval_days` | `30` \| `60` \| `90` |
| LineItem | `metadata.discount_percentage` | `20` \| `15` \| `10` |
| Fulfillment | `metadata.envia_shipment_id` | ID del envío en Envia |
| Fulfillment | `metadata.carrier` | Carrier seleccionado (ej. `dhl`) |
| Fulfillment | `metadata.envia_label_url` | URL del PDF de guía |

---

## API

### Catálogo (público)

```
GET  /store/products                    Lista productos con precios por región
GET  /store/variants/:id                Detalle de una variante
```

### Carrito (público)

```
POST /store/carts                       Crear carrito con region_id
POST /store/carts/:id/line-items        Agregar ítem (único o suscripción)
POST /store/carts/:id/payment-sessions  Crear sesión de pago (Openpay)
POST /store/carts/:id/complete          Completar orden { openpay_token_id, device_session_id }
```

Payload para ítem de suscripción:
```json
{
  "variant_id": "variant_xxx",
  "quantity": 1,
  "metadata": {
    "is_subscription": true,
    "interval_days": 30,
    "discount_percentage": 20
  }
}
```

### Suscripciones (requiere `Authorization: Bearer <clerk_jwt>`)

```
GET  /store/me/subscriptions            Lista suscripciones del usuario autenticado
POST /store/me/subscriptions/:id/pause      Pausar
POST /store/me/subscriptions/:id/resume     Reanudar (recalcula next_billing_date)
POST /store/me/subscriptions/:id/cancel     Cancelar
POST /store/me/subscriptions/:id/frequency  Cambiar frecuencia { interval_days: 30|60|90 }
```

### Métodos de pago (requiere `Authorization: Bearer <clerk_jwt>`)

```
GET  /store/me/payment-methods              Lista tarjetas del vault Openpay
POST /store/me/payment-methods/default      Cambiar tarjeta por defecto { openpay_token_id }
```

### Webhooks (público, autenticado por hash)

```
POST /webhooks/envia                    Recibe eventos de tracking de Envia
```

---

## Flujo de envíos (Envia.com)

Al capturarse el pago de una orden (`order.payment_captured`), el workflow `envia-create-fulfillment` se ejecuta automáticamente:

```
1. Cotiza todos los carriers en paralelo (ENVIA_CARRIERS o defaults)
2. Ordena por precio ascendente
3. Intenta generar guía con el más barato
   └─ Si falla (carrier no soporta la ruta), prueba el siguiente → fallback automático
4. Registra el fulfillment en Medusa con tracking number y URL de guía
   └─ Si este paso falla, el workflow cancela automáticamente la guía en Envia (compensation)
```

**Carriers validados en sandbox (origen Iztapalapa CDMX):**

| Carrier | Precio aprox. | Servicio |
|---------|--------------|---------|
| noventa9minutos | ~9 MXN | same_day (solo CDMX) |
| ups | ~12 MXN | saver |
| estafeta | ~229 MXN | express |
| dhl | ~305 MXN | ground |
| fedex | ~565 MXN | ground |

> Los precios de sandbox no reflejan tarifas reales. Validar en producción.

**Configurar carriers en producción:** agrega `ENVIA_CARRIERS=dhl,fedex,estafeta,redpack` en Railway con los carriers activos en tu cuenta. No requiere redeploy.

---

## Flujo de pago (triangular PCI-DSS)

```
Browser → Openpay : datos de tarjeta → tok_XXX   (nunca tocan el servidor)
Browser → Medusa  : tok_XXX + device_session_id
Medusa  → Openpay : cobro server-to-server con tok_XXX
```

---

## Autenticación

El middleware de Clerk en `src/api/middlewares.ts` valida el JWT en todas las rutas `/store/me/*` e inyecta `req.clerk_email` en el request.

**Bypass de desarrollo:** si `CLERK_SECRET_KEY` está vacío, cualquier header `Authorization: Bearer <cualquier-valor>` pasa con `clerk_email = dev@novapatch.mx`. Esto permite probar las rutas protegidas sin cuenta de Clerk.

---

## Despliegue en Railway

El proyecto requiere 3 servicios en el mismo proyecto de Railway:

| Servicio | Tipo | Notas |
|----------|------|-------|
| PostgreSQL | Plugin nativo | `DATABASE_URL` se inyecta automáticamente |
| Redis | Plugin nativo | `REDIS_URL` se inyecta automáticamente |
| novabackend | GitHub repo | Node.js, ver comandos abajo |

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npx medusa db:migrate && npm start
```

Las migraciones corren automáticamente en cada deploy. Medusa es idempotente — si ya están aplicadas, no hace nada.

**Variables de entorno en Railway** (además de las de desarrollo):
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NODE_ENV=production
OPENPAY_SANDBOX=false
ENVIA_API_URL=https://api.envia.com
ENVIA_QUERIES_URL=https://queries.envia.com
ENVIA_API_TOKEN=<token-de-produccion>
ENVIA_CARRIERS=noventa9minutos,ups,dhl,fedex,estafeta,redpack
MEDUSA_WAREHOUSE_LOCATION_ID=<id-del-stock-location>
```

**Post-deploy (una sola vez):**
```bash
npx medusa exec ./src/scripts/register-envia-webhook.ts
```
Registra el webhook de tracking en Envia apuntando a `https://<tu-dominio>/webhooks/envia`.

---

## Integraciones

| Servicio | Rol | Estado |
|----------|-----|--------|
| **Openpay** | Vault de tarjetas, tokenización, cobros server-to-server (México) | ✅ Implementado |
| **Clerk** | Validación de JWT en rutas protegidas, contexto de cliente | ✅ Implementado |
| **Envia.com** | Cotización multi-carrier, generación de guías, tracking por webhook | ✅ Implementado |
| **Resend** | Emails transaccionales vía Event Bus | Phase 3 |

---

## Roadmap

### Phase 2 — Pagos y suscripciones ✅
- [x] Módulo Openpay (`OpenpayClient` + `AbstractPaymentProvider`)
- [x] Override de `POST /store/carts/:id/complete`
- [x] Subscriber `order.placed` → crea `Subscription` por cada ítem de suscripción
- [x] Rutas de gestión de suscripciones (`/store/me/subscriptions/*`)
- [x] Rutas de métodos de pago (`/store/me/payment-methods`)

### Phase 2.5 — Envíos con Envia.com ✅
- [x] `EnviaClient`: HTTP wrapper con retry, detección de errores de aplicación (`meta:"error"`)
- [x] Mappers: `mapAddress()` con normalización de estados MX, `buildPackages()`, `splitStreetNumber()`
- [x] Workflow `envia-create-fulfillment` con 3 steps y compensation automática (cancela guía si Medusa falla)
- [x] Cotización en paralelo con `Promise.allSettled` + fallback de carrier en generate
- [x] Carrier list configurable via `ENVIA_CARRIERS` sin redeploy
- [x] Webhook `POST /webhooks/envia` con dedup Redis para eventos de tracking
- [x] Script de registro de webhook (`register-envia-webhook.ts`)

### Phase 3 — Billing recurrente y notificaciones
- [ ] Cron job diario `ProcessDailySubscriptions` (Redis)
- [ ] Emails transaccionales con Resend + React Email
  - `subscription.created` — bienvenida con calendario de cobros
  - `subscription.renewed` — recibo de cobro mensual
  - `subscription.payment_failed` — alerta con link para actualizar tarjeta
  - `subscription.upcoming_charge` — recordatorio 3 días antes
- [ ] Widget de admin (detalle de cliente → suscripciones)
- [ ] Ruta admin `/a/subscriptions` — tabla global con filtros y exportación CSV
