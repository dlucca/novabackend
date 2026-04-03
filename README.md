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

# Tests
npm run test:unit               # Tests unitarios (src/**/__tests__/**/*.unit.spec.ts)
npm run test:integration:http   # Tests de integración HTTP (integration-tests/http/)
```

---

## Estructura del proyecto

```
src/
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
│   ├── create-subscriptions-from-order/      # Crea Subscriptions al completar una orden
│   ├── pause-subscription/                   # active → paused
│   ├── resume-subscription/                  # paused → active (recalcula next_billing_date)
│   ├── cancel-subscription/                  # any → canceled
│   └── update-subscription-frequency/        # Actualiza interval_days (30|60|90)
├── subscribers/
│   └── order-placed.ts                       # Escucha order.placed → ejecuta workflow
├── api/
│   ├── middlewares.ts                         # Clerk JWT en /store/me/*
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
├── scripts/
│   └── seed-novapatch.ts                     # Seed: región MX, 6 productos, 4 precios c/u
└── __tests__/
    └── workflows/                            # Tests unitarios de lógica de workflows
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
```

---

## Integraciones

| Servicio | Rol |
|----------|-----|
| **Openpay** | Vault de tarjetas, tokenización, cobros server-to-server (México) |
| **Clerk** | Validación de JWT en rutas protegidas, contexto de cliente |
| **Resend** | Emails transaccionales vía Event Bus (Phase 3) |

---

## Roadmap

### Phase 2 — Pagos y suscripciones ✅
- [x] Módulo Openpay (`OpenpayClient` + `AbstractPaymentProvider`)
- [x] Override de `POST /store/carts/:id/complete`
- [x] Subscriber `order.placed` → crea `Subscription` por cada ítem de suscripción
- [x] Rutas de gestión de suscripciones (`/store/me/subscriptions/*`)
- [x] Rutas de métodos de pago (`/store/me/payment-methods`)

### Phase 3 — Billing recurrente y notificaciones
- [ ] Cron job diario `ProcessDailySubscriptions` (Redis)
- [ ] Emails transaccionales con Resend + React Email
  - `subscription.created` — bienvenida con calendario de cobros
  - `subscription.renewed` — recibo de cobro mensual
  - `subscription.payment_failed` — alerta con link para actualizar tarjeta
  - `subscription.upcoming_charge` — recordatorio 3 días antes
- [ ] Widget de admin (detalle de cliente → suscripciones)
- [ ] Ruta admin `/a/subscriptions` — tabla global con filtros y exportación CSV
