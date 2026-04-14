# Diseño: Soporte 3D Secure en checkout Openpay

**Fecha:** 2026-04-14  
**Scope:** Backend — plugin Openpay + route `/store/carts/:id/complete`  
**Estado:** Aprobado

---

## Contexto

El frontend ya maneja el flujo 3DS completo (redirect a Openpay, lectura de callback). El backend necesita detectar cuando Openpay exige 3DS y devolver una respuesta distinta en lugar de resolver directamente con una orden.

Actualmente `authorizePayment` siempre retorna `CAPTURED` asumiendo que el cobro fue inmediato. Con 3DS, Openpay puede responder con un `payment_method.url` que indica que el usuario debe autenticarse con su banco antes de que el cargo se confirme.

---

## Decisiones de diseño

### Enfoque elegido: Cargo pre-route (Opción 2)

El cargo a Openpay se realiza directamente en el route handler **antes** de llamar a `completeCartWorkflow`. `authorizePayment` se convierte en un passthrough que confirma un cargo pre-existente.

**Por qué:** Evita correr el `completeCartWorkflow` completo (inventario, impuestos, etc.) cuando Openpay requiere 3DS y no hay orden que crear. La primera llamada a `/complete` responde rápido con el redirect; la segunda llamada a `/complete-3ds` (tras 3DS) sí crea la orden.

**Trade-off aceptado:** La lógica de negocio de Openpay (crear customer, guardar tarjeta, cobrar) vive en el route en lugar del payment provider. El plugin pierde algo de pureza arquitectónica pero el flujo queda explícito y testeable.

---

## Contrato de API

### `POST /store/carts/:id/complete`

**Request (sin cambios):**
```json
{
  "openpay_token_id": "tok_xxx",
  "device_session_id": "kR1MiQhz2otdIuUlQkbEyitIk37...",
  "email": "usuario@ejemplo.com"
}
```

**Response — cobro directo (sin 3DS):**
```json
{ "type": "order", "order": { ...MedusaOrder } }
```

**Response — cobro pendiente 3DS:**
```json
{ "type": "redirect", "redirect_url": "https://verify.openpay.mx/..." }
```

---

### `POST /store/carts/:id/complete-3ds` ← NUEVO

**Request:**
```json
{ "openpay_transaction_id": "txn_xxx" }
```

**Response — éxito:**
```json
{ "type": "order", "order": { ...MedusaOrder } }
```

**Errores:**
| Caso | HTTP | Body |
|---|---|---|
| `openpay_transaction_id` faltante | 400 | `{ "message": "openpay_transaction_id is required" }` |
| Cart no encontrado | 404 | `{ "message": "Cart not found" }` |
| Cargo no en estado `completed` | 422 | `{ "message": "Pago no confirmado en Openpay" }` |
| Error al crear orden | 422 | `{ "message": "..." }` |

---

## Flujos completos

### Caso A — Sin 3DS

```
POST /store/carts/:id/complete
  ├─ Crea/obtiene Openpay customer
  ├─ Guarda tarjeta (storeCard)
  ├─ chargeCustomerCard(use_3d_secure: true, redirect_url)
  │    └─ charge.payment_method?.url → undefined
  ├─ updatePaymentSession({ openpay_charge_id, openpay_customer_id, openpay_card_id })
  ├─ completeCartWorkflow()
  │    └─ authorizePayment() → lee openpay_charge_id → return CAPTURED
  ├─ emit order.payment_captured
  └─ return { type: "order", order }
```

### Caso B — Con 3DS

```
POST /store/carts/:id/complete
  ├─ Crea/obtiene Openpay customer
  ├─ Guarda tarjeta (storeCard)
  ├─ chargeCustomerCard(use_3d_secure: true, redirect_url)
  │    └─ charge.payment_method.url → "https://verify.openpay.mx/..."
  ├─ updatePaymentSession({ openpay_charge_id, openpay_customer_id, openpay_card_id })
  └─ return { type: "redirect", redirect_url: charge.payment_method.url }

  [Usuario autenticación con banco vía Openpay]
  [Openpay redirige → https://novapatch.care/mx/checkout/3ds-return?id=txn_xxx&status=completed]

POST /store/carts/:id/complete-3ds { openpay_transaction_id: "txn_xxx" }
  ├─ getCharge("txn_xxx") → verificar status === "completed"
  ├─ updatePaymentSession({ openpay_charge_id: "txn_xxx" })
  ├─ completeCartWorkflow()
  │    └─ authorizePayment() → lee openpay_charge_id → return CAPTURED
  ├─ emit order.payment_captured
  └─ return { type: "order", order }
```

---

## Archivos modificados

### 1. `src/modules/openpay-payment/openpay-client.ts`

- Agregar `"charge_pending"` a `OpenpayCharge.status`
- Agregar `payment_method?: { url: string; type?: string }` a `OpenpayCharge`
- Agregar `use_3d_secure?: boolean` a params de `chargeCustomerCard`

### 2. `src/modules/openpay-payment/service.ts`

`authorizePayment` se convierte en passthrough:

```ts
async authorizePayment(input, legacyContext?) {
  const sessionData = /* extraer como ahora */
  const chargeId = sessionData.openpay_charge_id

  if (!chargeId) {
    // No debería ocurrir en producción — el route siempre pre-carga
    return { error: "No pre-authorized charge found", status: ERROR, data: {} }
  }

  this.logger_.info(`[Openpay] passthrough — charge_id=${chargeId}`)
  return { status: CAPTURED, data: { ...sessionData } }
}
```

### 3. `src/api/store/carts/[id]/complete/route.ts`

Lógica Openpay migra aquí desde `authorizePayment`:

```ts
// Instanciar cliente desde env vars
const openpay = new OpenpayClient({
  merchantId: process.env.OPENPAY_MERCHANT_ID!,
  privateKey: process.env.OPENPAY_PRIVATE_KEY!,
  sandbox: process.env.OPENPAY_SANDBOX !== "false",
})

// 1. Crear/obtener customer Openpay
// 2. storeCard(customerId, { token_id, device_session_id })
// 3. chargeCustomerCard(customerId, {
//      source_id: card.id,
//      amount: paymentAmount,
//      currency: "MXN",
//      description: "Novapatch order",
//      device_session_id,
//      use_3d_secure: true,
//      redirect_url: `${process.env.STOREFRONT_URL}/checkout/3ds-return`,
//    })
// 4. updatePaymentSession con charge_id + customer_id + card_id
// 5. Si charge.payment_method?.url → return { type: "redirect", redirect_url }
// 6. completeCartWorkflow → emit → return { type: "order", order }
```

### 4. `src/api/store/carts/[id]/complete-3ds/route.ts` ← NUEVO

```ts
export const POST = async (req, res) => {
  const { id: cartId } = req.params
  const { openpay_transaction_id } = req.body

  // Validar input, fetch cart + session
  // openpay.getCharge(openpay_transaction_id)
  // Si status !== "completed" → 422
  // updatePaymentSession({ openpay_charge_id })
  // completeCartWorkflow → emit order.payment_captured
  // return { type: "order", order: result }
}
```

---

## Variable de entorno nueva

```bash
STOREFRONT_URL=https://novapatch.care/mx
```

Usada para construir el `redirect_url` que recibe Openpay:
```
https://novapatch.care/mx/checkout/3ds-return
```

Openpay agrega los query params `?id=txn_xxx&status=completed` al redirigir de vuelta.

---

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| Cobro rechazado por banco (charge.status = "failed") | Openpay lanza error HTTP → catch → 422 con mensaje de Openpay |
| Usuario cancela 3DS (status = "cancelled" en callback) | Frontend maneja en `/checkout/3ds-return`; no llama `/complete-3ds` |
| `/complete-3ds` con cargo aún `charge_pending` | 422 `{ message: "Pago no confirmado en Openpay" }` |
| `authorizePayment` sin `openpay_charge_id` | Loguea error + retorna `ERROR` → `completeCartWorkflow` falla → 422 en route |
| Carga de inventario agotado después del cobro | Cargo ya ocurrió; Medusa puede tener problemas al crear orden — a monitorear |

---

## Qué NO cambia

- Flujo de suscripciones (cron job) — usa `chargeCustomerCard` directamente, sin 3DS
- `capturePayment`, `refundPayment`, `cancelPayment` — sin cambios
- Middleware Clerk, routes de subscripciones, payment-methods — sin cambios
- Modelo de datos — ninguna migración requerida
