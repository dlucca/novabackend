# Email Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actualizar los 4 emails de pedido con fuente Outfit, tracker de 3 pasos, footer con copyright y frase de marca, sin botón CTA en confirmación, y soporte para motivo de falla en entrega fallida.

**Architecture:** El componente compartido `OrderStatusTracker` se refactoriza a 3 pasos con una prop `variant` para el estado de error. `EmailLayout` cambia la fuente vía `@import` CSS. `EmailFooter` recibe contenido nuevo. Los templates individuales ajustan índices de paso y props según corresponde. El webhook de Envia extrae el `failureReason` del último evento del payload.

**Tech Stack:** React Email (`@react-email/components`), TypeScript, Jest (unit tests), `npm run test:unit`

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/emails/components/EmailLayout.tsx` | Modify | Montserrat → Outfit vía `@import` CSS en `<Head>` |
| `src/emails/components/EmailFooter.tsx` | Modify | Frase de marca + link + copyright |
| `src/emails/components/OrderStatusTracker.tsx` | Modify | 3 pasos; nueva prop `variant?: "default" \| "failed"` |
| `src/emails/OrderConfirmation.tsx` | Modify | Eliminar `<Button>` CTA |
| `src/emails/OrderShipped.tsx` | Modify | `currentStep={2}` → `currentStep={1}` |
| `src/emails/OrderDelivered.tsx` | Modify | `currentStep={3}` → `currentStep={2}` |
| `src/emails/OrderDeliveryFailed.tsx` | Modify | Agregar tracker `variant="failed"`; prop `failureReason?` |
| `src/api/webhooks/envia/route.ts` | Modify | Extraer `failureReason` y pasarlo a `OrderDeliveryFailed` |
| `src/__tests__/emails/email-templates.unit.spec.ts` | Create | Render tests para los 4 templates |

---

## Task 1: Fuente Outfit en EmailLayout

**Files:**
- Modify: `src/emails/components/EmailLayout.tsx`

- [ ] **Step 1: Reemplazar fuente**

Reemplazar el contenido completo de `src/emails/components/EmailLayout.tsx`:

```tsx
// src/emails/components/EmailLayout.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
} from "@react-email/components"
import * as React from "react"

type Props = {
  preview: string
  children: React.ReactNode
}

export function EmailLayout({ preview, children }: Props) {
  return (
    <Html lang="es">
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", margin: 0, padding: "32px 0", fontFamily: "Outfit, Arial, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            maxWidth: "600px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/components/EmailLayout.tsx
git commit -m "feat(emails): switch font from Montserrat to Outfit"
```

---

## Task 2: Footer con frase de marca y copyright

**Files:**
- Modify: `src/emails/components/EmailFooter.tsx`

- [ ] **Step 1: Actualizar footer**

Reemplazar el contenido completo de `src/emails/components/EmailFooter.tsx`:

```tsx
// src/emails/components/EmailFooter.tsx
import { Text, Link, Hr } from "@react-email/components"
import * as React from "react"

export function EmailFooter() {
  return (
    <>
      <Hr style={{ borderColor: "#E5E7EB", margin: "32px 0 20px" }} />
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: "12px",
          margin: "0 0 6px",
          textAlign: "center" as const,
          fontStyle: "italic",
        }}
      >
        bienestar que no interrumpe tu día
      </Text>
      <Text
        style={{
          color: "#6B7280",
          fontSize: "13px",
          margin: "0 0 6px",
          textAlign: "center" as const,
        }}
      >
        Novapatch · Ciudad de México ·{" "}
        <Link href="https://novapatch.care" style={{ color: "#003D70" }}>
          novapatch.care
        </Link>
      </Text>
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: "11px",
          margin: 0,
          textAlign: "center" as const,
        }}
      >
        © 2025 Novapatch. Todos los derechos reservados.
      </Text>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/components/EmailFooter.tsx
git commit -m "feat(emails): update footer with brand tagline and copyright"
```

---

## Task 3: OrderStatusTracker — 3 pasos y variante failed

**Files:**
- Modify: `src/emails/components/OrderStatusTracker.tsx`

- [ ] **Step 1: Reescribir el componente**

Reemplazar el contenido completo de `src/emails/components/OrderStatusTracker.tsx`:

```tsx
// src/emails/components/OrderStatusTracker.tsx
import { Row, Column, Section, Text, Link } from "@react-email/components"
import * as React from "react"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const RED = "#DC2626"
const GRAY_BG = "#E5E7EB"
const GRAY_TEXT = "#9CA3AF"

type StepDef = {
  label: string
  iconPath: string
  iconViewBox: string
}

const STEPS: StepDef[] = [
  {
    label: "Confirmado",
    iconPath: "M19 7h-1V6a5 5 0 00-10 0v1H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2zm-7 10a2 2 0 110-4 2 2 0 010 4zm3-10H9V6a3 3 0 016 0v1z",
    iconViewBox: "0 0 24 24",
  },
  {
    label: "En camino",
    iconPath: "M1 3h15v13H1zM16 8h4l3 3v6h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm13 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    iconViewBox: "0 0 24 24",
  },
  {
    label: "Entregado",
    iconPath: "M20 6L9 17l-5-5",
    iconViewBox: "0 0 24 24",
  },
]

// X icon for failed delivery
const FAILED_ICON_PATH = "M18 6L6 18M6 6l12 12"

type Props = {
  currentStep: 0 | 1 | 2
  variant?: "default" | "failed"
  trackingUrl?: string
}

function StepCircle({
  step,
  index,
  active,
  completed,
  isFailed,
}: {
  step: StepDef
  index: number
  active: boolean
  completed: boolean
  isFailed: boolean
}) {
  // Failed: last step (index 2) shows red X
  const showFailIcon = isFailed && index === 2

  let bg: string
  let borderColor: string
  let iconColor: string

  if (showFailIcon) {
    bg = RED
    borderColor = RED
    iconColor = "#ffffff"
  } else if (active) {
    bg = CORAL
    borderColor = CORAL
    iconColor = "#ffffff"
  } else if (completed) {
    bg = NAVY
    borderColor = NAVY
    iconColor = "#ffffff"
  } else {
    bg = "transparent"
    borderColor = GRAY_BG
    iconColor = GRAY_TEXT
  }

  const iconPath = showFailIcon ? FAILED_ICON_PATH : step.iconPath

  return (
    <table cellPadding={0} cellSpacing={0} style={{ margin: "0 auto" }}>
      <tr>
        <td
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: bg,
            border: `2px solid ${borderColor}`,
            textAlign: "center" as const,
            verticalAlign: "middle" as const,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox={step.iconViewBox}
            fill="none"
            stroke={iconColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "inline-block", verticalAlign: "middle" }}
          >
            <path d={iconPath} />
          </svg>
        </td>
      </tr>
    </table>
  )
}

export function OrderStatusTracker({
  currentStep,
  variant = "default",
  trackingUrl,
}: Props) {
  const isFailed = variant === "failed"

  return (
    <Section style={{ margin: "28px 0 20px" }}>
      {/* Circles + lines */}
      <Row>
        {STEPS.map((step, i) => {
          const active = i === currentStep
          const completed = i < currentStep
          const isLast = i === STEPS.length - 1

          return (
            <React.Fragment key={i}>
              <Column style={{ width: 64, textAlign: "center" as const }}>
                <StepCircle
                  step={step}
                  index={i}
                  active={active}
                  completed={completed}
                  isFailed={isFailed}
                />
              </Column>
              {!isLast && (
                <Column style={{ verticalAlign: "middle" as const, paddingBottom: 4 }}>
                  <div
                    style={{
                      height: 2,
                      backgroundColor: completed ? NAVY : GRAY_BG,
                    }}
                  />
                </Column>
              )}
            </React.Fragment>
          )
        })}
      </Row>

      {/* Labels */}
      <Row style={{ marginTop: 10 }}>
        {STEPS.map((step, i) => {
          const active = i === currentStep
          const completed = i < currentStep
          const isLast = i === STEPS.length - 1
          const showFailed = isFailed && i === 2

          let labelColor: string
          if (showFailed) {
            labelColor = RED
          } else if (active) {
            labelColor = CORAL
          } else if (completed) {
            labelColor = NAVY
          } else {
            labelColor = GRAY_TEXT
          }

          return (
            <React.Fragment key={i}>
              <Column style={{ width: 64, textAlign: "center" as const }}>
                <Text
                  style={{
                    fontSize: 10,
                    lineHeight: "1.3",
                    margin: 0,
                    color: labelColor,
                    fontWeight: active || showFailed ? 700 : 400,
                  }}
                >
                  {showFailed ? "No entregado" : step.label}
                </Text>
              </Column>
              {!isLast && <Column />}
            </React.Fragment>
          )
        })}
      </Row>

      {/* Tracking link */}
      {trackingUrl && (
        <Row style={{ marginTop: 16 }}>
          <Column style={{ textAlign: "center" as const }}>
            <Text style={{ fontSize: 13, margin: 0, color: "#4B5563" }}>
              Podés seguir tu pedido{" "}
              <Link href={trackingUrl} style={{ color: CORAL, fontWeight: 700 }}>
                haciendo clic aquí
              </Link>
            </Text>
          </Column>
        </Row>
      )}
    </Section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/components/OrderStatusTracker.tsx
git commit -m "feat(emails): refactor tracker to 3 steps with failed variant"
```

---

## Task 4: OrderConfirmation — eliminar botón CTA

**Files:**
- Modify: `src/emails/OrderConfirmation.tsx`

- [ ] **Step 1: Eliminar el import de Button y la sección CTA**

En `src/emails/OrderConfirmation.tsx`:

Cambiar la línea de imports de:
```tsx
import { Heading, Text, Row, Column, Section, Button, Hr } from "@react-email/components"
```
a:
```tsx
import { Heading, Text, Row, Column, Section, Hr } from "@react-email/components"
```

Eliminar el bloque completo del CTA (buscar y eliminar estas líneas):
```tsx
      {/* CTA */}
      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={detailsUrl}
          style={{
            backgroundColor: CORAL,
            color: "#ffffff",
            borderRadius: 6,
            padding: "13px 28px",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Ver detalles de mi pedido
        </Button>
      </Section>
```

Eliminar también las variables y props que ya no se usan. Quitar `trackingUrl` y `orderDetailsUrl` de la firma de `Props` y de la desestructuración en la función. Quitar la variable `detailsUrl` y la variable `storeUrl`. Quitar las props `trackingUrl` y `orderDetailsUrl` de `OrderStatusTracker` (dejar solo `currentStep={0}`).

El resultado de la función `OrderConfirmation` luego de los cambios:

```tsx
type Props = {
  name: string
  displayId: string | number
  items: OrderItem[]
  shippingAddress?: ShippingAddress | null
  currencyCode: string
}

export default function OrderConfirmation({
  name,
  displayId,
  items,
  shippingAddress,
  currencyCode,
}: Props) {
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const addr = shippingAddress
  const recipientName = addr
    ? [addr.first_name, addr.last_name].filter(Boolean).join(" ")
    : name
  const addressLine1 = addr?.address_1 ?? ""
  const addressLine2 = [addr?.city, addr?.province, addr?.postal_code]
    .filter(Boolean)
    .join(", ")

  return (
    <EmailLayout preview={`Tu pedido #${displayId} fue confirmado — Novapatch`}>
      <EmailHeader />

      {/* Order number */}
      <Row>
        <Column>
          <Heading
            style={{
              color: NAVY,
              fontSize: 22,
              margin: "0 0 4px",
              fontWeight: 700,
            }}
          >
            ¡Hola, {name}!
          </Heading>
          <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
            Confirmamos tu pedido
          </Text>
        </Column>
        <Column style={{ textAlign: "right" as const, verticalAlign: "top" as const }}>
          <Text
            style={{
              color: GRAY,
              fontSize: 12,
              margin: 0,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: 1,
            }}
          >
            Pedido
          </Text>
          <Text
            style={{ color: NAVY, fontSize: 15, margin: "2px 0 0", fontWeight: 700 }}
          >
            #{displayId}
          </Text>
        </Column>
      </Row>

      {/* Status tracker */}
      <OrderStatusTracker currentStep={0} />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      {/* Shipping info */}
      <Row style={{ marginBottom: 20 }}>
        <Column style={{ verticalAlign: "top" as const, paddingRight: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 6px" }}>
            Método de envío
          </Text>
          <Text style={{ fontSize: 14, color: NAVY, margin: "0 0 4px", fontWeight: 600 }}>
            Envío estándar
          </Text>
          <Text style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: "1.5" }}>
            3–5 días hábiles
          </Text>
        </Column>
        {addr && (
          <Column style={{ verticalAlign: "top" as const }}>
            <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 6px" }}>
              Dirección de envío
            </Text>
            {recipientName && (
              <Text style={{ fontSize: 14, color: NAVY, margin: "0 0 4px", fontWeight: 600 }}>
                {recipientName}
              </Text>
            )}
            {addressLine1 && (
              <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 2px" }}>
                {addressLine1}
              </Text>
            )}
            {addressLine2 && (
              <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
                {addressLine2}
              </Text>
            )}
          </Column>
        )}
      </Row>

      <Hr style={{ borderColor: "#E5E7EB", margin: "0 0 20px" }} />

      {/* Items table */}
      <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 12px" }}>
        Detalle
      </Text>

      {items.map((item, i) => {
        const isSub = item.metadata?.is_subscription === true
        return (
          <Section
            key={i}
            style={{
              borderTop: i === 0 ? `2px solid ${NAVY}` : "1px solid #E5E7EB",
              padding: "10px 0",
            }}
          >
            <Row>
              <Column style={{ fontSize: 14, color: "#1F2937" }}>
                {item.title}
                {isSub && (
                  <Text style={{ display: "inline", fontSize: 11, color: CORAL, fontWeight: 600, marginLeft: 6 }}>
                    · Suscripción
                  </Text>
                )}
              </Column>
              <Column style={{ textAlign: "center" as const, width: 48, fontSize: 14, color: GRAY }}>
                ×{item.quantity}
              </Column>
              <Column style={{ textAlign: "right" as const, width: 90, fontSize: 14, fontWeight: 600, color: "#1F2937" }}>
                {fmt(item.unit_price * item.quantity, currencyCode)}
              </Column>
            </Row>
          </Section>
        )
      })}

      {/* Total */}
      <Section style={{ borderTop: `2px solid ${NAVY}`, padding: "12px 0 20px" }}>
        <Row>
          <Column style={{ textAlign: "right" as const, paddingRight: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>
              Total
            </Text>
          </Column>
          <Column style={{ textAlign: "right" as const, width: 90 }}>
            <Text style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>
              {fmt(total, currencyCode)}
            </Text>
          </Column>
        </Row>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderConfirmation.defaultProps = {
  name: "Ramiro",
  displayId: "1042",
  currencyCode: "mxn",
  items: [
    { title: "Parche Energía Novapatch", quantity: 1, unit_price: 450, metadata: {} },
    { title: "Parche Sueño Profundo", quantity: 2, unit_price: 380, metadata: { is_subscription: true } },
  ],
  shippingAddress: {
    first_name: "Ramiro",
    last_name: "Dlucca",
    address_1: "Av. Insurgentes Sur 1234",
    city: "Ciudad de México",
    province: "CDMX",
    postal_code: "03100",
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/OrderConfirmation.tsx
git commit -m "feat(emails): remove CTA button from order confirmation"
```

---

## Task 5: OrderShipped — actualizar paso del tracker

**Files:**
- Modify: `src/emails/OrderShipped.tsx`

- [ ] **Step 1: Cambiar currentStep de 2 a 1**

En `src/emails/OrderShipped.tsx`, cambiar:
```tsx
<OrderStatusTracker currentStep={2} trackingUrl={trackingUrl} />
```
por:
```tsx
<OrderStatusTracker currentStep={1} trackingUrl={trackingUrl} />
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/OrderShipped.tsx
git commit -m "feat(emails): update shipped email tracker to step 1 of 3"
```

---

## Task 6: OrderDelivered — actualizar paso del tracker

**Files:**
- Modify: `src/emails/OrderDelivered.tsx`

- [ ] **Step 1: Cambiar currentStep de 3 a 2**

En `src/emails/OrderDelivered.tsx`, cambiar:
```tsx
<OrderStatusTracker currentStep={3} />
```
por:
```tsx
<OrderStatusTracker currentStep={2} />
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/OrderDelivered.tsx
git commit -m "feat(emails): update delivered email tracker to step 2 of 3"
```

---

## Task 7: OrderDeliveryFailed — agregar tracker y failureReason

**Files:**
- Modify: `src/emails/OrderDeliveryFailed.tsx`

- [ ] **Step 1: Reemplazar el template completo**

Reemplazar el contenido completo de `src/emails/OrderDeliveryFailed.tsx`:

```tsx
// src/emails/OrderDeliveryFailed.tsx
import { Heading, Text, Section, Button, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY = "#6B7280"

type Props = {
  name: string
  displayId: string | number
  trackingNumber: string
  status: "failed" | "returned"
  failureReason?: string
}

export default function OrderDeliveryFailed({
  name,
  displayId,
  trackingNumber,
  status,
  failureReason,
}: Props) {
  const isReturned = status === "returned"
  const headline = isReturned
    ? `Tu pedido #${displayId} fue devuelto`
    : `No pudimos entregar tu pedido #${displayId}`
  const bodyText = isReturned
    ? "El paquete fue regresado al remitente. Contáctanos para coordinar una nueva entrega."
    : "El transportista intentó entregar tu pedido pero no fue posible completarlo. Contáctanos para ayudarte."

  return (
    <EmailLayout preview={`${headline} — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
        {headline}
      </Text>

      <OrderStatusTracker currentStep={2} variant="failed" />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      <Section style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
        <Text style={{ fontSize: 14, color: "#DC2626", margin: "0 0 4px", fontWeight: 600 }}>
          {isReturned ? "Pedido devuelto" : "Entrega fallida"}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 8px" }}>
          {bodyText}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 4px" }}>
          Guía: {trackingNumber}
        </Text>
        {failureReason && (
          <Text style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            Detalle del transportista: {failureReason}
          </Text>
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href="mailto:hola@novapatch.care"
          style={{
            backgroundColor: CORAL,
            color: "#ffffff",
            borderRadius: 6,
            padding: "13px 28px",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Contactar soporte
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderDeliveryFailed.defaultProps = {
  name: "Ramiro",
  displayId: "1042",
  trackingNumber: "1Z999AA10123456784",
  status: "failed" as "failed" | "returned",
  failureReason: "Destinatario no encontrado en domicilio",
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/OrderDeliveryFailed.tsx
git commit -m "feat(emails): add tracker and failureReason to delivery failed email"
```

---

## Task 8: Envia webhook — extraer y pasar failureReason

**Files:**
- Modify: `src/api/webhooks/envia/route.ts`

- [ ] **Step 1: Pasar failureReason a OrderDeliveryFailed**

En `src/api/webhooks/envia/route.ts`, dentro del bloque `else` donde se renderiza `OrderDeliveryFailed` (líneas ~128-135), cambiar:

```tsx
html = await renderEmail(
  React.createElement(OrderDeliveryFailed, {
    name: customerName,
    displayId,
    trackingNumber,
    status: status as "failed" | "returned",
  })
)
```

por:

```tsx
const failureReason = payload.events?.at(-1)?.description

html = await renderEmail(
  React.createElement(OrderDeliveryFailed, {
    name: customerName,
    displayId,
    trackingNumber,
    status: status as "failed" | "returned",
    failureReason,
  })
)
```

- [ ] **Step 2: Commit**

```bash
git add src/api/webhooks/envia/route.ts
git commit -m "feat(emails): pass carrier failure reason to delivery failed email"
```

---

## Task 9: Tests de render

**Files:**
- Create: `src/__tests__/emails/email-templates.unit.spec.ts`

- [ ] **Step 1: Crear el archivo de tests**

Crear `src/__tests__/emails/email-templates.unit.spec.ts`:

```ts
import { render } from "@react-email/components"
import * as React from "react"
import OrderConfirmation from "../../emails/OrderConfirmation"
import OrderShipped from "../../emails/OrderShipped"
import OrderDelivered from "../../emails/OrderDelivered"
import OrderDeliveryFailed from "../../emails/OrderDeliveryFailed"

const CONFIRMATION_PROPS = {
  name: "Test",
  displayId: "99",
  currencyCode: "mxn",
  items: [{ title: "Shield", quantity: 1, unit_price: 750 }],
  shippingAddress: {
    first_name: "Test",
    last_name: "User",
    address_1: "Calle 1",
    city: "CDMX",
    province: "CDMX",
    postal_code: "06600",
  },
}

describe("Email templates render without errors", () => {
  it("OrderConfirmation renders and contains expected content", async () => {
    const html = await render(React.createElement(OrderConfirmation, CONFIRMATION_PROPS))
    expect(html).toContain("Confirmamos tu pedido")
    expect(html).toContain("#99")
    expect(html).toContain("Confirmado")
    expect(html).toContain("En camino")
    expect(html).toContain("Entregado")
    expect(html).toContain("bienestar que no interrumpe tu día")
    expect(html).toContain("novapatch.care")
    expect(html).toContain("© 2025 Novapatch")
    expect(html).not.toContain("Ver detalles de mi pedido")
    expect(html).not.toContain("En preparación")
  })

  it("OrderShipped renders with step 1 active", async () => {
    const html = await render(
      React.createElement(OrderShipped, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
        trackingUrl: "https://example.com/track/ABC123",
        carrier: "99minutos",
      })
    )
    expect(html).toContain("está en camino")
    expect(html).toContain("ABC123")
    expect(html).not.toContain("En preparación")
  })

  it("OrderDelivered renders with step 2 active", async () => {
    const html = await render(
      React.createElement(OrderDelivered, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
      })
    )
    expect(html).toContain("fue entregado")
    expect(html).toContain("bienestar que no interrumpe tu día")
  })

  it("OrderDeliveryFailed renders tracker and failureReason", async () => {
    const html = await render(
      React.createElement(OrderDeliveryFailed, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
        status: "failed",
        failureReason: "Destinatario no encontrado",
      })
    )
    expect(html).toContain("No pudimos entregar")
    expect(html).toContain("No entregado")
    expect(html).toContain("Detalle del transportista: Destinatario no encontrado")
  })

  it("OrderDeliveryFailed renders without failureReason (optional prop)", async () => {
    const html = await render(
      React.createElement(OrderDeliveryFailed, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
        status: "returned",
      })
    )
    expect(html).toContain("fue devuelto")
    expect(html).not.toContain("Detalle del transportista")
  })
})
```

- [ ] **Step 2: Ejecutar tests — verificar que FALLAN antes de tener la implementación completa**

```bash
npm run test:unit -- --testPathPattern="email-templates"
```

Si todos los cambios anteriores ya están aplicados, los tests deberían pasar. Si alguno falla, revisar el mensaje de error para identificar qué implementación está incompleta.

- [ ] **Step 3: Confirmar que todos los tests pasan**

Expected output:
```
PASS src/__tests__/emails/email-templates.unit.spec.ts
  Email templates render without errors
    ✓ OrderConfirmation renders and contains expected content
    ✓ OrderShipped renders with step 1 active
    ✓ OrderDelivered renders with step 2 active
    ✓ OrderDeliveryFailed renders tracker and failureReason
    ✓ OrderDeliveryFailed renders without failureReason (optional prop)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/emails/email-templates.unit.spec.ts
git commit -m "test(emails): add render tests for all order email templates"
```

---

## Task 10: Build check final

- [ ] **Step 1: Verificar que el proyecto compila sin errores**

```bash
npx tsc --noEmit
```

Expected: sin output (0 errores).

- [ ] **Step 2: Ejecutar todos los unit tests**

```bash
npm run test:unit
```

Expected: todos los tests en verde.
