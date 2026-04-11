# Email Design Refresh — Spec

**Branch:** `feat/email-design-refresh`
**Date:** 2026-04-11

## Objetivo

Actualizar los emails transaccionales de pedido para reflejar exactamente las 3 etapas de notificación al cliente (Confirmado → En camino → Entregado/No entregado), cambiar la tipografía a Outfit, y mejorar el footer con copyright y frase de marca.

---

## Decisiones de diseño

### 1. Tracker de estado: 3 pasos (antes 4)

| Antes | Ahora |
|-------|-------|
| Tu pedido → En preparación → En camino → Entregado | Confirmado → En camino → Entregado |

Se elimina "En preparación" porque nunca dispara un email — el cliente lo veía en el tracker sin recibir notificación. El tracker ahora refleja 1:1 los emails que el cliente realmente recibe.

**Etiqueta activa:** "Confirmado" (no "Tu pedido").

**Índices de paso por email:**
- `OrderConfirmation`: step 0 (Confirmado)
- `OrderShipped`: step 1 (En camino) — antes era 2
- `OrderDelivered`: step 2 (Entregado) — antes era 3
- `OrderDeliveryFailed`: step 2 con variante de error (rojo, ícono X)

### 2. Fuente: Outfit

Se reemplaza Montserrat por Outfit en todos los emails de orden. Outfit es más geométrica y contemporánea; carga igual vía Google Fonts woff2.

Pesos a cargar: 400, 600, 700.

URL base: `https://fonts.gstatic.com/s/outfit/...`

### 3. Email de confirmación — sin botón CTA

Se elimina el botón "Ver detalles de mi pedido". El email queda limpio: header → tracker → envío → detalle de items → total → footer.

### 4. Footer actualizado (todos los emails)

Nuevo contenido del `EmailFooter`:
```
bienestar que no interrumpe tu día   ← itálica, gris claro
Novapatch · Ciudad de México · novapatch.care   ← link al sitio
© 2025 Novapatch. Todos los derechos reservados.   ← copyright
```

### 5. OrderDeliveryFailed — tracker + motivo de falla

Cambios:
- **Agregar `OrderStatusTracker`** con `currentStep={2}` en variante de error. El tracker necesita soporte para un estado `failed` en el último paso (ícono X, borde rojo).
- **Nueva prop `failureReason?: string`**: mensaje raw del transportista.
- **Layout del motivo:**
  - Título amigable: "No pudimos entregar tu pedido" / "Tu pedido fue devuelto"
  - Texto principal amigable explicando la situación
  - Detalle secundario en gris claro: `Detalle del transportista: {failureReason}`

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/emails/components/EmailLayout.tsx` | Cambiar fuente de Montserrat → Outfit (3 pesos: 400, 600, 700) |
| `src/emails/components/EmailFooter.tsx` | Agregar frase de marca, copyright |
| `src/emails/components/OrderStatusTracker.tsx` | Reducir a 3 pasos; agregar variante `failed` en step 2; nueva prop `variant?: "default" \| "failed"` |
| `src/emails/OrderConfirmation.tsx` | Eliminar `<Button>` CTA; el tracker hereda automáticamente los 3 pasos |
| `src/emails/OrderShipped.tsx` | Actualizar `currentStep={1}` (antes 2) |
| `src/emails/OrderDelivered.tsx` | Actualizar `currentStep={2}` (antes 3) |
| `src/emails/OrderDeliveryFailed.tsx` | Agregar `OrderStatusTracker` con `currentStep={2}` y `variant="failed"`; agregar prop `failureReason?: string`; actualizar layout del motivo |
| `src/api/webhooks/envia/route.ts` | Extraer `failureReason` del payload y pasarlo a `OrderDeliveryFailed`. Fuente: `payload.events?.at(-1)?.description` |

---

## OrderStatusTracker — spec de la variante failed

El paso final (`Entregado`) cuando `variant="failed"`:
- Círculo: borde rojo (`#DC2626`), fondo rojo tenue o rojo sólido
- Ícono: X en lugar de check
- Label: "No entregado" en rojo

---

## Fuera de alcance

- Emails de suscripción (`SubscriptionWelcome`, `SubscriptionRenewed`, `SubscriptionPaymentFailed`) — se pueden actualizar a Outfit en una iteración posterior
- Rediseño de layout general de otros emails
