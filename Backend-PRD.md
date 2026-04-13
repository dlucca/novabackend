# Novapatch Backend — Documento de Implementación Técnica

> **Versión**: 1.0 | **Fecha**: Abril 2026
> Este documento describe con exactitud el estado actual de la implementación del backend de Novapatch. Está dirigido a desarrolladores fullstack que necesitan entender, mantener o extender el sistema.

---

## Índice

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura de Directorios](#3-estructura-de-directorios)
4. [Variables de Entorno](#4-variables-de-entorno)
5. [Configuración (medusa-config.ts)](#5-configuración-medusa-configts)
6. [Modelo de Datos](#6-modelo-de-datos)
7. [Módulos Personalizados](#7-módulos-personalizados)
8. [API REST — Endpoints](#8-api-rest--endpoints)
9. [Middleware de Autenticación](#9-middleware-de-autenticación)
10. [Workflows](#10-workflows)
11. [Remote Links](#11-remote-links)
12. [Subscribers (Event Bus)](#12-subscribers-event-bus)
13. [Jobs Programados (Cron)](#13-jobs-programados-cron)
14. [Templates de Email](#14-templates-de-email)
15. [Scripts de Seed y Setup](#15-scripts-de-seed-y-setup)
16. [Tests](#16-tests)
17. [Flujos de Negocio Completos](#17-flujos-de-negocio-completos)
18. [Despliegue y Comandos](#18-despliegue-y-comandos)

---

## 1. Visión General

Novapatch es una plataforma de e-commerce headless para la venta de parches vitamínicos por suscripción, dirigida inicialmente a México (expansión planeada a Brasil, Argentina, Colombia, Chile).

### Características clave del backend

- **6 productos** (energy, sleep, glow, shield, zen, woman) con 4 niveles de precio cada uno (una vez, mensual, bimestral, trimestral)
- **Motor de suscripciones** propio: módulo personalizado con entidades Subscription y SubscriptionOrder
- **Cobros recurrentes automáticos** vía cron job diario a medianoche (hora CDMX)
- **Pagos tokenizados** con Openpay (México) — los datos de tarjeta nunca tocan los servidores de Novapatch
- **Autenticación** con Clerk JWT en rutas protegidas `/store/me/*`
- **Emails transaccionales** con Resend + React Email

### URL Base

```
http://localhost:9000         # Desarrollo
https://[railway-url]         # Producción (Railway)
```

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Medusa.js | 2.13.1 |
| Runtime | Node.js | 20+ |
| Lenguaje | TypeScript | 5.6.x |
| Base de datos | PostgreSQL | — |
| Cache / Queues | Redis | — |
| Pagos | Openpay | API REST |
| Autenticación | Clerk | @clerk/backend 3.x |
| Email | Resend | API REST |
| Templates de email | React Email | @react-email/components 1.x |
| Hosting | Railway | — |
| Testing | Jest + SWC | 29.x |

### Dependencias principales (package.json)

```json
{
  "@clerk/backend": "^3.2.4",
  "@medusajs/admin-sdk": "2.13.1",
  "@medusajs/cli": "2.13.1",
  "@medusajs/framework": "2.13.1",
  "@medusajs/medusa": "2.13.1",
  "@react-email/components": "^1.0.11"
}
```

---

## 3. Estructura de Directorios

```
novabackend/
├── medusa-config.ts                   # Configuración principal de Medusa
├── package.json
├── tsconfig.json
├── jest.config.js
│
└── src/
    ├── admin/
    │   └── i18n/index.ts              # Placeholder i18n (vacío)
    │
    ├── api/
    │   ├── middlewares.ts             # Clerk JWT middleware → /store/me/*
    │   ├── store/
    │   │   ├── custom/route.ts        # GET /store/custom (health check)
    │   │   ├── carts/
    │   │   │   └── [id]/
    │   │   │       ├── complete/route.ts         # POST — checkout con Openpay
    │   │   │       └── payment-sessions/route.ts # POST — crear sesión de pago
    │   │   └── me/
    │   │       ├── customer/route.ts             # GET — obtener/crear cliente
    │   │       ├── payment-methods/
    │   │       │   ├── route.ts                  # GET — listar tarjetas
    │   │       │   └── default/route.ts          # POST — cambiar tarjeta default
    │   │       └── subscriptions/
    │   │           ├── route.ts                  # GET — listar suscripciones
    │   │           └── [id]/
    │   │               ├── cancel/route.ts       # POST — cancelar
    │   │               ├── pause/route.ts        # POST — pausar
    │   │               ├── resume/route.ts       # POST — reactivar
    │   │               └── frequency/route.ts    # POST — cambiar frecuencia
    │   └── admin/
    │       └── custom/route.ts        # GET /admin/custom (health check)
    │
    ├── emails/
    │   ├── components/
    │   │   ├── EmailLayout.tsx
    │   │   ├── EmailHeader.tsx
    │   │   └── EmailFooter.tsx
    │   ├── OrderConfirmation.tsx
    │   ├── SubscriptionWelcome.tsx
    │   ├── SubscriptionRenewed.tsx
    │   └── SubscriptionPaymentFailed.tsx
    │
    ├── jobs/
    │   └── process-daily-subscriptions.ts  # Cron: 0 6 * * * (medianoche CST)
    │
    ├── lib/
    │   └── resend.ts                  # renderEmail() + sendEmail()
    │
    ├── links/
    │   ├── subscription-customer.ts           # Customer ↔ Subscription
    │   ├── subscription-product-variant.ts    # Subscription ↔ ProductVariant
    │   ├── subscription-order.ts              # Subscription → Order (original_order_id)
    │   └── subscription-order-order.ts        # SubscriptionOrder → Order (order_id)
    │
    ├── modules/
    │   ├── subscription/
    │   │   ├── models/
    │   │   │   ├── subscription.ts
    │   │   │   └── subscription-order.ts
    │   │   ├── migrations/
    │   │   │   ├── Migration20260403001710.ts  # Tablas base
    │   │   │   ├── Migration20260403002315.ts  # order_id en subscription_order
    │   │   │   └── Migration20260403002418.ts  # original_order_id en subscription
    │   │   ├── service.ts
    │   │   └── index.ts               # SUBSCRIPTION_MODULE = "subscriptionModuleService"
    │   │
    │   └── openpay-payment/
    │       ├── openpay-client.ts      # HTTP client para Openpay API
    │       ├── openpay-payment-service.ts  # AbstractPaymentProvider
    │       ├── index.ts
    │       └── __tests__/
    │           └── openpay-payment-service.unit.spec.ts
    │
    ├── scripts/
    │   ├── seed.ts                    # Seed genérico de Medusa (demo)
    │   ├── seed-novapatch.ts          # 6 productos + región MX + inventario
    │   ├── setup-shipping.ts          # Crea opción envío $85 MXN flat
    │   ├── create-api-key.ts          # Vincula API key con sales channel
    │   ├── update-prices.ts           # Actualiza precios por SKU pattern
    │   └── diagnose.ts               # Debug de pricing setup
    │
    ├── subscribers/
    │   ├── order-placed.ts                    # Dispara workflow de suscripciones
    │   ├── order-confirmation-email.ts        # Email confirmación de pedido
    │   ├── subscription-welcome-email.ts      # Email bienvenida suscripción
    │   ├── subscription-renewed-email.ts      # Email cargo exitoso
    │   └── subscription-payment-failed-email.ts  # Email pago fallido
    │
    ├── workflows/
    │   ├── create-subscriptions-from-order/
    │   ├── pause-subscription/
    │   ├── resume-subscription/
    │   ├── cancel-subscription/
    │   ├── update-subscription-frequency/
    │   └── process-billing-cycle/
    │
    └── __tests__/
        └── workflows/
            └── create-subscriptions-from-order/
                └── create-subscriptions.unit.spec.ts
```

---

## 4. Variables de Entorno

Todas las variables requeridas para producción:

```bash
# ── Base de datos y cache ────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:port/dbname
REDIS_URL=redis://user:pass@host:port

# ── CORS (separados por coma si son múltiples) ──────────────────
STORE_CORS=https://tu-frontend.com
ADMIN_CORS=https://tu-admin.com,http://localhost:9000
AUTH_CORS=https://tu-frontend.com,http://localhost:9000

# ── Seguridad ────────────────────────────────────────────────────
JWT_SECRET=<string-aleatorio-seguro>
COOKIE_SECRET=<string-aleatorio-seguro>

# ── Clerk (autenticación) ────────────────────────────────────────
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxx

# ── Openpay (pagos MX) ───────────────────────────────────────────
OPENPAY_MERCHANT_ID=mxxxxxxxxxxxx
OPENPAY_PRIVATE_KEY=sk_xxxxxxxxxxxx
OPENPAY_SANDBOX=false          # true en desarrollo

# ── Resend (email) ───────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=Novapatch <hola@novapatch.care>   # opcional, este es el default

# ── Shipping ─────────────────────────────────────────────────────
FLAT_SHIPPING_OPTION_ID=so_xxxxxxxxxxxxxxxx   # obtenido al ejecutar setup-shipping.ts

# ── Admin ────────────────────────────────────────────────────────
DISABLE_ADMIN=false   # true para deshabilitar el panel admin
```

> **Nota de desarrollo**: Si `CLERK_SECRET_KEY` no está definido, el middleware de auth entra en modo dev y bypasea la verificación del JWT, inyectando un usuario por defecto.

---

## 5. Configuración (medusa-config.ts)

```typescript
// Módulos activos:
modules: [
  // Módulo personalizado de suscripciones
  {
    resolve: "./src/modules/subscription",
    options: {}
  },

  // Fulfillment manual (sin courier real)
  {
    resolve: "@medusajs/fulfillment-manual"
  },

  // Proveedor de pagos Openpay
  {
    resolve: "./src/modules/openpay-payment",
    options: {
      merchantId: process.env.OPENPAY_MERCHANT_ID,
      privateKey: process.env.OPENPAY_PRIVATE_KEY,
      sandbox: process.env.OPENPAY_SANDBOX === "true" ?? true,
    }
  }
]
```

---

## 6. Modelo de Datos

### 6.1 Entidades nativas de Medusa (sin modificar)

- **Customer**: cliente registrado. Se extiende con `metadata`:
  - `metadata.openpay_customer_id` — ID del cliente en vault Openpay
  - `metadata.openpay_default_card_id` — ID de la tarjeta por defecto
  - `metadata.clerk_user_id` — ID del usuario en Clerk

- **Order**: pedido. Sus line items pueden tener `metadata`:
  - `metadata.is_subscription: true` — indica que el item genera suscripción
  - `metadata.interval_days: 30 | 60 | 90` — frecuencia de la suscripción
  - `metadata.discount_percentage: 20 | 15 | 10` — descuento aplicado

- **ProductVariant**: variante de producto. SKU con patrón `{producto}-{plan}`.
  - Ejemplo: `energy-monthly`, `sleep-quarterly`, `glow-once`

### 6.2 Entidades personalizadas

#### Tabla: `subscription`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | TEXT PK | ID generado por Medusa |
| `status` | TEXT | `active` \| `paused` \| `canceled` \| `past_due` \| `delayed_out_of_stock` |
| `interval_days` | INTEGER | `30`, `60` o `90` |
| `next_billing_date` | TIMESTAMPTZ | Próxima fecha de cargo |
| `original_order_id` | TEXT | FK → Order (pedido que originó la suscripción) |
| `metadata` | JSONB | Datos adicionales |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | Soft delete |

**Estados posibles de `status`:**

| Estado | Descripción |
|--------|-------------|
| `active` | Activa, se cobra en la próxima fecha |
| `paused` | Pausada por el cliente, no se cobra |
| `canceled` | Cancelada definitivamente |
| `past_due` | Cargo fallido, requiere atención |
| `delayed_out_of_stock` | Sin stock, se reintenta diariamente |

#### Tabla: `subscription_order`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | TEXT PK | — |
| `subscription_id` | TEXT FK | → subscription.id |
| `order_id` | TEXT | FK → Order (pedido de renovación) |
| `cycle_number` | INTEGER | Número de ciclo (1 = primera renovación, 2 = segunda, …) |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |
| `deleted_at` | TIMESTAMPTZ | — |

### 6.3 Remote Links (relaciones entre módulos)

| Enlace | Descripción |
|--------|-------------|
| Customer ↔ Subscription | Un cliente puede tener muchas suscripciones |
| Subscription ↔ ProductVariant | Una suscripción está vinculada a una variante de producto |
| Subscription → Order | La suscripción conoce su pedido original (read-only, via `original_order_id`) |
| SubscriptionOrder → Order | Cada renovación conoce su pedido generado (read-only, via `order_id`) |

### 6.4 Productos y precios

**6 SKUs:** `energy`, `sleep`, `glow`, `shield`, `zen`, `woman`

**4 planes por producto:**

| Plan | `interval_days` | Descuento | Precio MXN |
|------|----------------|-----------|-----------|
| `once` (una vez) | N/A | 0% | $750 |
| `monthly` (mensual) | 30 | 20% | $600 |
| `bimonthly` (bimestral) | 60 | 15% | $637 |
| `quarterly` (trimestral) | 90 | 10% | $675 |

**Patrón de SKU:** `{slug}-{plan}` → ej. `glow-monthly`, `energy-quarterly`

---

## 7. Módulos Personalizados

### 7.1 Módulo de Suscripciones (`src/modules/subscription/`)

**Constante:** `SUBSCRIPTION_MODULE = "subscriptionModuleService"`

El servicio extiende `MedusaService` del framework, lo que le otorga CRUD automático sobre las entidades `Subscription` y `SubscriptionOrder`.

```typescript
// Uso en workflows y rutas:
const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)

// Métodos disponibles (auto-generados por MedusaService):
await subscriptionService.createSubscriptions({ ... })
await subscriptionService.updateSubscriptions({ id, ...data })
await subscriptionService.listSubscriptions({ status: "active" })
await subscriptionService.retrieveSubscription(id)
await subscriptionService.deleteSubscriptions(id)

await subscriptionService.createSubscriptionOrders({ ... })
await subscriptionService.listSubscriptionOrders({ subscription_id })
```

### 7.2 Módulo de Pagos Openpay (`src/modules/openpay-payment/`)

#### OpenpayClient (`openpay-client.ts`)

Cliente HTTP para la API de Openpay. Todas las llamadas usan Basic Auth (merchantId:privateKey en Base64).

**URLs base:**
- Sandbox: `https://sandbox-api.openpay.mx/v1/{merchantId}`
- Producción: `https://api.openpay.mx/v1/{merchantId}`

**Métodos:**

```typescript
// Crear cliente en vault Openpay
client.createCustomer({ name, email, phone_number? })
// → { id: "a9yvnfpn..." }

// Almacenar tarjeta tokenizada en vault
client.storeCard(openpayCustomerId, { token_id: "tok_xxx", device_session_id? })
// → { id: "kdpfkuoiupdkxhk...", brand, card_number (masked) }

// Listar tarjetas guardadas
client.listCards(openpayCustomerId)
// → [ { id, brand, card_number, expiration_month, expiration_year } ]

// Cobrar tarjeta guardada de un cliente
client.chargeCustomerCard(openpayCustomerId, {
  source_id: cardId,
  amount,
  currency: "MXN",
  description,
  device_session_id?,
  order_id?
})
// → { id: "charge_id", amount, status, authorization }

// Obtener detalle de un cargo
client.getCharge(chargeId)
// → { id, amount, status, authorization, ... }

// Reembolsar cargo
client.refundCharge(chargeId, { description })
```

> **Importante sobre montos**: Medusa v2 almacena los precios en unidades mayores (pesos, no centavos). El OpenpayClient usa el monto directamente tal como viene de Medusa.

#### OpenpayPaymentService (`openpay-payment-service.ts`)

Implementa `AbstractPaymentProvider` de Medusa v2.

| Método | Comportamiento |
|--------|---------------|
| `initiatePayment()` | Devuelve `{ status: PENDING }` sin acción real |
| `updatePayment()` | Persiste `openpay_token_id`, `device_session_id`, `customer_email`, `customer_name` en la sesión |
| `authorizePayment()` | **Lógica principal**: crea/reutiliza cliente Openpay, almacena tarjeta, ejecuta cargo |
| `capturePayment()` | No-op (Openpay captura de forma inmediata) |
| `refundPayment()` | Llama a `refundCharge()` en Openpay |
| `cancelPayment()` | Llama a `refundCharge()` si hay `charge_id` |
| `retrievePayment()` | Llama a `getCharge()` |
| `getWebhookActionAndData()` | Devuelve `NOT_SUPPORTED` |

**Flujo de `authorizePayment()`:**
1. Extrae `openpay_token_id`, `device_session_id`, email y nombre del cliente de `session.data`
2. Busca `openpay_customer_id` en `customer.metadata`
3. Si no existe → crea cliente en Openpay → guarda ID en `customer.metadata`
4. Almacena la tarjeta tokenizada en el vault del cliente
5. Ejecuta el cargo con la tarjeta recién guardada
6. Devuelve `{ status: AUTHORIZED, data: { charge_id, card_id, openpay_customer_id } }`

---

## 8. API REST — Endpoints

### Convención de autenticación

- **Rutas públicas**: No requieren token. Cualquier cliente puede llamarlas.
- **Rutas protegidas (`/store/me/*`)**: Requieren header `Authorization: Bearer <clerk_jwt>`

El JWT de Clerk se obtiene en el frontend con `useAuth().getToken()`.

---

### 8.1 Rutas de Carrito (públicas)

#### `POST /store/carts/:id/payment-sessions`

Crea la sesión de pago Openpay para un carrito. Automáticamente agrega envío flat si está configurado.

**Flujo interno:**
1. Busca el carrito
2. Si `FLAT_SHIPPING_OPTION_ID` está definido, agrega el método de envío al carrito
3. Ejecuta `createPaymentCollectionForCartWorkflow`
4. Ejecuta `createPaymentSessionWorkflow` para Openpay
5. Devuelve el carrito actualizado con `payment_collection`

**Response `200`:**
```json
{
  "cart": {
    "id": "cart_01XXXXX",
    "payment_collection": {
      "id": "payco_01XXXXX",
      "payment_sessions": [
        {
          "id": "ps_01XXXXX",
          "provider_id": "pp_openpay-payment_openpay",
          "status": "pending",
          "data": {}
        }
      ]
    }
  }
}
```

**Errores:**

| Código | Motivo |
|--------|--------|
| `404` | Carrito no encontrado |
| `422` | Carrito sin monto / fallo al crear colección de pago |

---

#### `POST /store/carts/:id/complete`

Completa el checkout. Recibe el token de Openpay y ejecuta el pago.

**Request body:**
```json
{
  "openpay_token_id": "tok_xxxxxxxxxxxxx",
  "device_session_id": "kR1MiQhz2otdIuUlQkbEyitIk",
  "email": "cliente@email.com"
}
```

> `device_session_id` es obligatorio en producción para antifraude. Se obtiene con `OpenPay.deviceData.setup()` en el frontend.

**Flujo interno:**
1. Valida que `openpay_token_id` esté presente
2. Obtiene el carrito con su payment session
3. Inyecta `openpay_token_id`, `device_session_id`, email y nombre en `session.data` vía `updatePaymentSession`
4. Ejecuta `completeCartWorkflow` de Medusa (que dispara `authorizePayment` en el provider)
5. Si el pago fue autorizado, el workflow crea el Order

**Response `200`:**
```json
{
  "type": "order",
  "order": {
    "id": "order_01XXXXX",
    "display_id": 42,
    "status": "pending",
    "total": 600,
    "currency_code": "mxn",
    "items": [ ... ],
    "shipping_address": { ... }
  }
}
```

**Errores:**

| Código | Motivo |
|--------|--------|
| `400` | `openpay_token_id` no enviado |
| `404` | Carrito no encontrado |
| `422` | Sin payment session / autorización fallida |

---

### 8.2 Rutas de Cliente (protegidas)

#### `GET /store/me/customer`

Obtiene el cliente de Medusa asociado al JWT de Clerk. Si no existe, lo crea.

**Headers requeridos:**
```
Authorization: Bearer <clerk_jwt>
```

**Response `200` (cliente existente) / `201` (cliente creado):**
```json
{
  "customer": {
    "id": "cus_01XXXXX",
    "email": "usuario@email.com",
    "first_name": "Juan",
    "last_name": "Pérez"
  }
}
```

---

### 8.3 Rutas de Métodos de Pago (protegidas)

#### `GET /store/me/payment-methods`

Lista las tarjetas guardadas del cliente en el vault de Openpay.

**Response `200`:**
```json
{
  "payment_methods": [
    {
      "id": "kdpfkuoiupdkxhk",
      "brand": "visa",
      "last4": "411111XXXXXX1111",
      "exp_month": "12",
      "exp_year": "2027",
      "is_default": true
    }
  ]
}
```

> **Nota**: `last4` devuelve la cadena enmascarada completa de Openpay (ej. `"411111XXXXXX1111"`), no solo los últimos 4 dígitos. En el frontend se usa `.slice(-4)` para mostrar solo los últimos 4.

**Errores:**

| Código | Motivo |
|--------|--------|
| `401` | Token inválido o ausente |
| `502` | Fallo al llamar a Openpay |

---

#### `POST /store/me/payment-methods/default`

Establece una tarjeta como predeterminada para cobros de suscripción.

**Request body (una de dos opciones):**
```json
{ "card_id": "kdpfkuoiupdkxhk" }
```
```json
{ "openpay_token_id": "tok_xxxxxxxxx" }
```

**Cuándo usar cada uno:**
- `card_id` → para establecer como default una tarjeta ya guardada en el vault
- `openpay_token_id` → para guardar una nueva tarjeta y establecerla como default

**Response `200`:**
```json
{
  "payment_method": {
    "id": "kdpfkuoiupdkxhk",
    "brand": "visa",
    "last4": "411111XXXXXX1111",
    "exp_month": "12",
    "exp_year": "2027",
    "is_default": true
  }
}
```

**Errores:**

| Código | Motivo |
|--------|--------|
| `400` | Falta `card_id` en el body |
| `401` | Token inválido |
| `404` | Cliente o tarjeta no encontrada |
| `422` | Cliente sin cuenta Openpay |
| `502` | Fallo en Openpay |

---

### 8.4 Rutas de Suscripciones (protegidas)

#### `GET /store/me/subscriptions`

Lista todas las suscripciones activas e históricas del cliente autenticado.

**Response `200`:**
```json
{
  "subscriptions": [
    {
      "id": "sub_01XXXXX",
      "status": "active",
      "interval_days": 30,
      "next_delivery_at": "2026-05-05T06:00:00.000Z",
      "product_title": "Energy",
      "variant_id": "variant_01XXXXX",
      "unit_price": 600,
      "quantity": 1,
      "created_at": "2026-04-05T12:00:00.000Z"
    }
  ]
}
```

---

#### `POST /store/me/subscriptions/:id/pause`

Pausa una suscripción activa. No se realizarán cobros hasta que se reactive.

**Request body:** vacío `{}`

**Response `200`:**
```json
{
  "subscription": {
    "id": "sub_01XXXXX",
    "status": "paused",
    ...
  }
}
```

**Errores:** `400` si la suscripción no está activa o no existe.

---

#### `POST /store/me/subscriptions/:id/resume`

Reactiva una suscripción pausada. Recalcula `next_billing_date = hoy + interval_days`.

**Request body:** vacío `{}`

**Response `200`:**
```json
{
  "subscription": {
    "id": "sub_01XXXXX",
    "status": "active",
    "next_billing_date": "2026-05-05T06:00:00.000Z",
    ...
  }
}
```

**Errores:** `400` si la suscripción no está pausada o no existe.

---

#### `POST /store/me/subscriptions/:id/cancel`

Cancela una suscripción de forma definitiva.

**Request body:** vacío `{}`

**Response `200`:**
```json
{
  "subscription": {
    "id": "sub_01XXXXX",
    "status": "canceled",
    ...
  }
}
```

---

#### `POST /store/me/subscriptions/:id/frequency`

Cambia la frecuencia de una suscripción.

**Request body:**
```json
{
  "interval_days": 60
}
```

> Solo se aceptan los valores `30`, `60` o `90`. Cualquier otro valor devuelve `400`.

**Response `200`:**
```json
{
  "subscription": {
    "id": "sub_01XXXXX",
    "interval_days": 60,
    ...
  }
}
```

---

### 8.5 Rutas de Health Check

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/store/custom` | Health check store |
| `GET` | `/admin/custom` | Health check admin |

Ambas devuelven HTTP `200` sin body.

---

## 9. Middleware de Autenticación

**Archivo:** `src/api/middlewares.ts`

**Aplicado a:** todas las rutas bajo `/store/me/*`

### Flujo de validación

```
Request → /store/me/*
  │
  ├─ Extrae header: Authorization: Bearer <token>
  │
  ├─ Si NO hay CLERK_SECRET_KEY (modo dev):
  │     → Bypasea validación
  │     → Inyecta usuario dev por defecto
  │     → next()
  │
  └─ Si SÍ hay CLERK_SECRET_KEY:
        → verifyToken(token, { secretKey: CLERK_SECRET_KEY })
        │
        ├─ Token válido:
        │     → req.clerk_user_id = payload.sub
        │     → req.clerk_email = payload.email
        │     → next()
        │
        └─ Token inválido / ausente:
              → return 401 { message: "Unauthorized" }
```

### Uso en rutas protegidas

```typescript
// En cualquier route handler bajo /store/me/*
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { clerk_email, clerk_user_id } = req as any;
  // Buscar cliente por clerk_email en Medusa...
}
```

---

## 10. Workflows

Los workflows de Medusa implementan lógica transaccional con **compensación automática** — si un paso falla, los pasos anteriores se revierten.

### 10.1 `create-subscriptions-from-order`

**Disparado por:** evento `order.placed` (vía subscriber)

**Input:** `{ order_id: string }`

**Pasos:**

1. **Idempotency check** — Si ya existen subscriptions vinculadas al order, termina sin error
2. **Fetch order** — Obtiene el pedido completo con items y datos de pago
3. **Filter subscription items** — Filtra items con `metadata.is_subscription === true`
4. **Validate intervals** — Verifica que `interval_days` sea 30, 60 o 90
5. **For each subscription item:**
   - Calcula `next_billing_date = now() + interval_days`
   - Crea registro `Subscription` (status: "active")
   - Crea remote link: Customer ↔ Subscription
   - Crea remote link: Subscription ↔ ProductVariant
6. **Persist Openpay customer ID** — Guarda `openpay_customer_id` en `customer.metadata` (obtenido del resultado de la autorización del pago)

**Compensación:** Si algún paso falla después de crear suscripciones, las elimina y deshace los links.

---

### 10.2 `pause-subscription`

**Input:** `{ subscription_id: string }`

**Validaciones:**
- La suscripción existe
- El status es `"active"`

**Acción:** `status → "paused"`

**Compensación:** Revierte al status anterior si falla algún paso posterior.

---

### 10.3 `resume-subscription`

**Input:** `{ subscription_id: string }`

**Validaciones:**
- La suscripción existe
- El status es `"paused"`

**Acción:**
- `status → "active"`
- `next_billing_date = now() + interval_days`

**Compensación:** Revierte status y fecha al valor anterior.

---

### 10.4 `cancel-subscription`

**Input:** `{ subscription_id: string }`

**Validaciones:**
- La suscripción existe
- No está ya cancelada

**Acción:** `status → "canceled"`

**Compensación:** Revierte al status anterior.

---

### 10.5 `update-subscription-frequency`

**Input:** `{ subscription_id: string, interval_days: 30 | 60 | 90 }`

**Validaciones:**
- `interval_days` es exactamente 30, 60 o 90
- La suscripción existe
- El status es `"active"` o `"paused"`

**Acción:** `interval_days → nuevo valor`

**Compensación:** Revierte al `interval_days` anterior.

---

### 10.6 `process-billing-cycle`

El workflow más complejo. Se ejecuta una vez por suscripción desde el cron job diario.

**Input:** `{ subscription_id: string }`

**Pasos:**

```
1. Verificar que status === "active"
2. Fetch original_order (dirección de envío, datos de item)
3. Fetch customer → obtener openpay_customer_id de metadata
4. Verificar inventario de la variante:
   │
   ├─ Sin stock y sin backorder:
   │     → status = "delayed_out_of_stock"
   │     → return { delayed: true, reason: "out_of_stock" }
   │
   └─ Con stock (o check falla → fail-open, se procede):
        │
        5. Obtener tarjeta default de Openpay:
           → default_card_id de metadata, o primera tarjeta del vault
        │
        6. Cobrar con Openpay:
           │
           ├─ Cargo fallido:
           │     → status = "past_due"
           │     → emit "subscription.payment_failed"
           │     → return { failed: true, reason }
           │
           └─ Cargo exitoso:
                │
                7. Crear Medusa Order (clon del pedido original):
                   - Mismo item, cantidad, variante
                   - Metadata: is_subscription=true, cycle_number, subscription_id
                │
                8. Crear SubscriptionOrder:
                   - subscription_id, order_id, cycle_number (autoincremental)
                │
                9. Avanzar next_billing_date:
                   - next_billing_date += interval_days
                │
                10. emit "subscription.renewed"
                │
                return { success: true, order_id, cycle_number }
```

**Retornos posibles:**

```typescript
{ success: true, order_id: string, cycle_number: number }
{ failed: true, reason: string }
{ skipped: true, reason: "not_active" }
{ delayed: true, reason: "out_of_stock" }
```

---

## 11. Remote Links

Los Remote Links son el mecanismo de Medusa v2 para relacionar entidades de módulos distintos sin acoplar los módulos entre sí.

### `subscription-customer.ts`
```
Customer (Medusa core) ←→ Subscription (custom module)
Tipo: 1 customer → N subscriptions
Creado en: create-subscriptions-from-order workflow
```

### `subscription-product-variant.ts`
```
Subscription ←→ ProductVariant (Medusa core)
Tipo: 1 subscription → 1 variant
Creado en: create-subscriptions-from-order workflow
```

### `subscription-order.ts`
```
Subscription → Order (Medusa core)
Campo: Subscription.original_order_id
Tipo: read-only (el Order no conoce la Subscription)
```

### `subscription-order-order.ts`
```
SubscriptionOrder → Order (Medusa core)
Campo: SubscriptionOrder.order_id
Tipo: read-only (el Order no conoce el SubscriptionOrder)
```

### Cómo consultar datos a través de links

```typescript
// Obtener suscripciones de un cliente
const remoteQuery = container.resolve(ContainerRegistrationKeys.REMOTE_QUERY)

const result = await remoteQuery({
  customer: {
    fields: ["id", "email"],
    subscription: {
      fields: ["id", "status", "interval_days", "next_billing_date"]
    }
  },
  variables: { id: customerId }
})
```

---

## 12. Subscribers (Event Bus)

Los subscribers escuchan eventos del sistema y ejecutan acciones de forma asíncrona. **Nunca lanzan excepciones hacia afuera** para no bloquear el flujo principal.

### `order-placed.ts` → `order.placed`
- Dispara el workflow `create-subscriptions-from-order`
- Si falla, solo loguea el error

### `order-confirmation-email.ts` → `order.placed`
- Renderiza `OrderConfirmation` React component
- Envía email al `order.email`
- Asunto: `"Pedido #{display_id} confirmado — Novapatch"`

### `subscription-welcome-email.ts` → `order.placed`
- **Condición**: solo si el pedido contiene items con `metadata.is_subscription === true`
- Renderiza `SubscriptionWelcome` React component
- Envía email al cliente
- Asunto: `"¡Bienvenido a Novapatch! Tu suscripción está activa"`

### `subscription-renewed-email.ts` → `subscription.renewed`
- Renderiza `SubscriptionRenewed` React component
- **Payload recibido:** `{ customer_email, amount, currency, cycle_number, next_billing_date, charge_id }`
- Envía email al cliente
- Asunto: `"Novapatch — Cargo realizado: $600 MXN"`

### `subscription-payment-failed-email.ts` → `subscription.payment_failed`
- Renderiza `SubscriptionPaymentFailed` React component
- **Payload recibido:** `{ customer_email, customer_name, reason, error_message? }`
- Envía email al cliente
- Asunto: `"Novapatch — Problema con tu pago de suscripción"`

---

## 13. Jobs Programados (Cron)

### `process-daily-subscriptions`

**Archivo:** `src/jobs/process-daily-subscriptions.ts`

**Horario:** `0 6 * * *` — 06:00 UTC = 00:00 CST (medianoche Ciudad de México)

**Algoritmo:**

```
1. Listar todas las Subscriptions con status = "active"
2. Filtrar aquellas con next_billing_date <= now()
3. Para cada suscripción vencida:
   → ejecutar processBillingCycleWorkflow({ subscription_id })
   → acumular resultado en contadores: succeeded / failed / delayed
4. Log resumen: "Procesadas N suscripciones: X éxitos, Y fallos, Z delayed"
```

**Contadores de resultado:**

```typescript
{
  total: number,       // Total de suscripciones procesadas
  succeeded: number,   // Cobros exitosos (orden creado)
  failed: number,      // Cobros fallidos (status → past_due)
  delayed: number,     // Sin stock (status → delayed_out_of_stock)
}
```

---

## 14. Templates de Email

**Servicio:** `src/lib/resend.ts`

```typescript
// Renderizar template React a HTML
const html = await renderEmail(<OrderConfirmation order={order} />)

// Enviar email
await sendEmail({
  to: "cliente@email.com",
  subject: "Asunto del email",
  html: html
})
```

**Sender por defecto:** `Novapatch <hola@novapatch.care>`

### Templates disponibles

| Template | Evento disparador | Datos recibidos |
|----------|------------------|-----------------|
| `OrderConfirmation` | `order.placed` | items, shipping_address, currency, display_id |
| `SubscriptionWelcome` | `order.placed` (con subs) | subscription_items[], interval_days |
| `SubscriptionRenewed` | `subscription.renewed` | amount, currency, cycle_number, next_billing_date, charge_id |
| `SubscriptionPaymentFailed` | `subscription.payment_failed` | customer_name, reason, error_message? |

Todos los templates usan `EmailLayout` → `EmailHeader` + contenido + `EmailFooter`.

---

## 15. Scripts de Seed y Setup

Todos se ejecutan con `npx medusa exec ./src/scripts/<script>.ts`

### `seed-novapatch.ts` ← **Ejecutar primero en entorno nuevo**

Crea todo el catálogo de Novapatch:

- **Región México** con moneda MXN
- **Sales Channel** "Novapatch Store"
- **Stock Location** "Novapatch Warehouse MX"
- **6 productos** (energy, sleep, glow, shield, zen, woman)
  - Cada uno con **4 variantes** (once, monthly, bimonthly, quarterly)
  - **Inventario inicial**: 1,000 unidades por variante
  - **Precios** según tabla de la sección 6.4

### `setup-shipping.ts` ← **Ejecutar una sola vez**

Crea la infraestructura de envío:

- FulfillmentSet vinculado al stock location
- ServiceZone para México
- ShippingProfile (default)
- ShippingOption: "Envío estándar a domicilio" — **$85 MXN flat**

**⚠️ Al finalizar, muestra en consola el `FLAT_SHIPPING_OPTION_ID`** → copiar al `.env`.

### `create-api-key.ts`

- Lista las API keys existentes
- Vincula la publishable key con el sales channel

> Obtener la publishable key desde: Medusa Admin → Settings → API Keys

### `update-prices.ts`

Actualiza precios de variantes buscando por patrón de SKU. Útil si se necesita re-sincronizar precios sin hacer seed completo.

### `diagnose.ts`

Script de debugging que imprime el estado actual de variantes, price sets y sus relaciones. Útil para verificar que el pricing esté correctamente configurado.

---

## 16. Tests

### Tests unitarios

```bash
npm run test:unit
```

**`create-subscriptions.unit.spec.ts`** — Cubre:
- Validación de `interval_days` (solo 30, 60, 90)
- Filtrado de items con `is_subscription === true`
- Cálculo de `next_billing_date`
- Idempotencia (no duplicar suscripciones)

**`openpay-payment-service.unit.spec.ts`** — Cubre:
- `initiatePayment` (devuelve PENDING)
- `authorizePayment` (creación de cliente, almacenamiento de tarjeta, cargo)
- Manejo de errores (token inválido, fondos insuficientes, etc.)
- `capturePayment` (no-op)
- `cancelPayment` / `refundPayment`
- Validación de montos

### Tests de integración

```bash
npm run test:integration:http      # Pruebas HTTP end-to-end
npm run test:integration:modules   # Pruebas de módulos
```

---

## 17. Flujos de Negocio Completos

### 17.1 Checkout con suscripción (primera vez)

```
Frontend                          Backend                           Openpay
   │                                 │                                │
   ├─ POST /store/carts               │                                │
   │   { region_id }                 │                                │
   │◄── { cart: { id } } ────────────┤                                │
   │                                 │                                │
   ├─ POST /store/carts/:id/line-items│                                │
   │   { variant_id,                 │                                │
   │     metadata: {                 │                                │
   │       is_subscription: true,    │                                │
   │       interval_days: 30,        │                                │
   │       discount_percentage: 20 } │                                │
   │   }                             │                                │
   │◄── { cart: { items... } } ──────┤                                │
   │                                 │                                │
   ├─ [Cliente ingresa datos tarjeta] │                                │
   │                                 │                                │
   ├────────── cardData ─────────────┼──────────────────────────────►│
   │◄────────── tok_XXX ─────────────┼─────────────────────────────── │
   │                                 │                                │
   ├─ POST /store/carts/:id/payment-sessions                          │
   │   {}                            │                                │
   │◄── { cart: { payment_collection } }                              │
   │                                 │                                │
   ├─ POST /store/carts/:id/complete  │                                │
   │   { openpay_token_id: tok_XXX,  │                                │
   │     device_session_id }         │                                │
   │                                 ├─── createCustomer ────────────►│
   │                                 │◄── { id: openpay_customer_id } │
   │                                 │                                │
   │                                 ├─── storeCard(token) ──────────►│
   │                                 │◄── { id: card_id } ────────────│
   │                                 │                                │
   │                                 ├─── chargeCard(amount) ────────►│
   │                                 │◄── { id: charge_id, OK } ──────│
   │                                 │                                │
   │                                 ├─ Crea Order en Medusa          │
   │                                 ├─ emit "order.placed"           │
   │                                 │                                │
   │                                 ├─ [subscriber] create-subscriptions-from-order
   │                                 │   → Crea Subscription (active) │
   │                                 │   → next_billing_date = hoy+30 │
   │                                 │                                │
   │                                 ├─ [subscriber] order-confirmation-email
   │                                 ├─ [subscriber] subscription-welcome-email
   │                                 │                                │
   │◄── { type: "order", order: {...} }                               │
```

### 17.2 Cobro automático de suscripción (cron diario)

```
Cron (00:00 CST)
  │
  ├─ Lista Subscriptions: status=active AND next_billing_date <= now
  │
  └─ Para cada suscripción:
       │
       ├─ process-billing-cycle workflow
       │    │
       │    ├─ Verifica stock
       │    │    └─ Sin stock → status="delayed_out_of_stock" → STOP
       │    │
       │    ├─ Obtiene tarjeta default de Openpay
       │    │
       │    ├─ Cobro Openpay
       │    │    │
       │    │    ├─ FALLO → status="past_due"
       │    │    │           emit "subscription.payment_failed"
       │    │    │           → Email alerta al cliente
       │    │    │
       │    │    └─ ÉXITO → Crea Order en Medusa
       │    │               Crea SubscriptionOrder (cycle_number++)
       │    │               next_billing_date += interval_days
       │    │               emit "subscription.renewed"
       │    │               → Email recibo al cliente
```

### 17.3 Gestión de suscripción por el cliente

```
GET    /store/me/subscriptions          ← Ver todas las suscripciones
POST   /store/me/subscriptions/:id/pause       ← active → paused
POST   /store/me/subscriptions/:id/resume      ← paused → active (recalcula fecha)
POST   /store/me/subscriptions/:id/cancel      ← any → canceled
POST   /store/me/subscriptions/:id/frequency   ← cambiar a 30/60/90 días
```

---

## 18. Despliegue y Comandos

### Comandos de desarrollo

```bash
npx medusa develop                          # Inicia servidor en :9000 con hot reload
npx medusa db:migrate                       # Ejecuta migraciones + sincroniza links
npx medusa user -e EMAIL -p PASS            # Crea usuario admin
```

### Comandos de generación de migraciones

```bash
npx medusa db:generate subscriptionModuleService   # Genera migración para el módulo
```

### Orden de setup en entorno nuevo

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.template .env
# Editar .env con los valores correctos

# 3. Ejecutar migraciones
npx medusa db:migrate

# 4. Crear usuario admin
npx medusa user -e admin@novapatch.care -p password123

# 5. Seed de productos (región MX, 6 SKUs, inventario)
npx medusa exec ./src/scripts/seed-novapatch.ts

# 6. Configurar shipping (ejecutar UNA sola vez)
npx medusa exec ./src/scripts/setup-shipping.ts
# ⚠️ Copiar el FLAT_SHIPPING_OPTION_ID al .env

# 7. Obtener API key del admin y vincular al sales channel
# → Medusa Admin → Settings → API Keys → crear Publishable key
npx medusa exec ./src/scripts/create-api-key.ts
# ⚠️ Copiar la publishable key al .env del frontend (NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)

# 8. Iniciar servidor
npx medusa develop
```

### Despliegue en Railway

El proyecto está configurado para Railway. Las variables de entorno se configuran en el dashboard de Railway.

**Build command:** `npm run build`
**Start command:** `npm start`
**Node version:** 20+

---

## Notas técnicas importantes

### Manejo de montos

Medusa v2 almacena todos los precios en **unidades mayores** (pesos MXN, no centavos). Openpay también recibe los montos en pesos. No se necesita conversión.

```typescript
// ✅ Correcto — Medusa entrega 600 (pesos)
amount: session.amount  // 600

// ❌ Incorrecto — No dividir por 100
amount: session.amount / 100  // 6 (centavos → pesos) — WRONG
```

### Idempotencia en creación de suscripciones

El workflow `create-subscriptions-from-order` verifica si ya existen suscripciones vinculadas al order antes de crear nuevas. Esto previene duplicados si el evento `order.placed` se emite más de una vez.

### Fail-open en verificación de inventario

Si la verificación de inventario falla por error técnico (timeout, error de DB), el proceso de cobro **continúa**. Solo se bloquea el cobro cuando se confirma explícitamente que no hay stock.

### Compensación de workflows

Todos los pasos de workflow tienen handlers de compensación. Si cualquier paso falla, los pasos anteriores exitosos se revierten automáticamente, garantizando consistencia de datos.

### Autenticación en desarrollo

Si `CLERK_SECRET_KEY` no está definido en `.env`, el middleware de `/store/me/*` **no valida el token** y inyecta un usuario de desarrollo por defecto. Esto permite trabajar localmente sin configurar Clerk.
