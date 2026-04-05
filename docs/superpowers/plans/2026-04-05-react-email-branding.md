# React Email Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 4 transactional email templates from raw inline HTML strings to typed React Email components with consistent Novapatch branding (Montserrat font, navy #003D70 + cyan #17B8A3 palette, logo from Cloudinary).

**Architecture:** Install `@react-email/components`, build shared `EmailLayout` / `EmailHeader` / `EmailFooter` components, create one typed `.tsx` template per email event, add a `renderEmail()` helper to `src/lib/resend.ts`, and update each subscriber to call `renderEmail(<Template />)` instead of constructing raw HTML strings.

**Tech Stack:** React Email (`@react-email/components`), React 18 (already installed), TypeScript, Resend (existing).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/emails/components/EmailLayout.tsx` | Html, Head, Font (Montserrat), Body, Container wrapper |
| Create | `src/emails/components/EmailHeader.tsx` | Cloudinary logo + cyan divider |
| Create | `src/emails/components/EmailFooter.tsx` | Footer text + novapatch.care link |
| Create | `src/emails/OrderConfirmation.tsx` | Order confirmation template |
| Create | `src/emails/SubscriptionWelcome.tsx` | Subscription welcome template |
| Create | `src/emails/SubscriptionRenewed.tsx` | Renewal receipt template |
| Create | `src/emails/SubscriptionPaymentFailed.tsx` | Payment failed template (urgent style) |
| Modify | `src/lib/resend.ts` | Add `renderEmail()` helper |
| Modify | `src/subscribers/order-confirmation-email.ts` | Use `OrderConfirmation` template |
| Modify | `src/subscribers/subscription-welcome-email.ts` | Use `SubscriptionWelcome` template |
| Modify | `src/subscribers/subscription-renewed-email.ts` | Use `SubscriptionRenewed` template |
| Modify | `src/subscribers/subscription-payment-failed-email.ts` | Use `SubscriptionPaymentFailed` template |

---

### Task 1: Install @react-email/components

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
npm install @react-email/components
```

Expected: package added to `dependencies` in `package.json`, no peer dep errors.

- [ ] **Step 2: Verify it resolves**

```bash
node -e "require('@react-email/components')" && echo "OK"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @react-email/components"
```

---

### Task 2: Build shared EmailLayout component

**Files:**
- Create: `src/emails/components/EmailLayout.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/emails/components/EmailLayout.tsx
import {
  Html,
  Head,
  Font,
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
        <Font
          fontFamily="Montserrat"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Montserrat"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/montserrat/v26/JTURjIg1_i6t8kCHKm45_bZF3gnD_g.woff2",
            format: "woff2",
          }}
          fontWeight={600}
          fontStyle="normal"
        />
        <Font
          fontFamily="Montserrat"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/montserrat/v26/JTURjIg1_i6t8kCHKm45_dJE3gnD_g.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", margin: 0, padding: "32px 0", fontFamily: "Montserrat, Arial, sans-serif" }}>
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `src/emails/components/EmailLayout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/emails/components/EmailLayout.tsx
git commit -m "feat(emails): add EmailLayout shared component"
```

---

### Task 3: Build shared EmailHeader and EmailFooter

**Files:**
- Create: `src/emails/components/EmailHeader.tsx`
- Create: `src/emails/components/EmailFooter.tsx`

- [ ] **Step 1: Create EmailHeader**

```tsx
// src/emails/components/EmailHeader.tsx
import { Img, Hr } from "@react-email/components"
import * as React from "react"

const LOGO_URL =
  "https://res.cloudinary.com/dxnoqul2v/image/upload/f_auto,q_auto/logonova_chs6v3"

export function EmailHeader() {
  return (
    <>
      <Img
        src={LOGO_URL}
        alt="Novapatch"
        width={140}
        style={{ display: "block", margin: "0 auto 20px" }}
      />
      <Hr style={{ borderColor: "#17B8A3", borderWidth: "2px", margin: "0 0 24px" }} />
    </>
  )
}
```

- [ ] **Step 2: Create EmailFooter**

```tsx
// src/emails/components/EmailFooter.tsx
import { Text, Link } from "@react-email/components"
import * as React from "react"

export function EmailFooter() {
  return (
    <Text
      style={{
        color: "#6b7280",
        fontSize: "13px",
        marginTop: "32px",
        textAlign: "center" as const,
      }}
    >
      Novapatch · Ciudad de México ·{" "}
      <Link href="https://novapatch.care" style={{ color: "#003D70" }}>
        novapatch.care
      </Link>
    </Text>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/emails/components/EmailHeader.tsx src/emails/components/EmailFooter.tsx
git commit -m "feat(emails): add EmailHeader and EmailFooter components"
```

---

### Task 4: Build OrderConfirmation template

**Files:**
- Create: `src/emails/OrderConfirmation.tsx`

- [ ] **Step 1: Create the template**

```tsx
// src/emails/OrderConfirmation.tsx
import { Heading, Text, Row, Column, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type OrderItem = {
  title: string
  quantity: number
  unit_price: number
  metadata?: Record<string, unknown>
}

type ShippingAddress = {
  address_1?: string
  address_2?: string
  city?: string
  province?: string
  postal_code?: string
  first_name?: string
}

type Props = {
  name: string
  displayId: string | number
  items: OrderItem[]
  shippingAddress?: ShippingAddress | null
  currencyCode: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(n)
}

export function OrderConfirmation({ name, displayId, items, shippingAddress, currencyCode }: Props) {
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const addr = shippingAddress
  const addressText = addr
    ? `${addr.address_1 ?? ""}${addr.address_2 ? `, ${addr.address_2}` : ""}, ${addr.city ?? ""}, ${addr.province ?? ""} ${addr.postal_code ?? ""}`
    : "No disponible"

  return (
    <EmailLayout preview={`Tu pedido #${displayId} fue confirmado — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        ¡Gracias por tu compra, {name}!
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 24px" }}>
        Tu pedido <strong>#{displayId}</strong> ha sido confirmado.
      </Text>

      {/* Table header */}
      <Section style={{ borderBottom: "2px solid #003D70", marginBottom: "0" }}>
        <Row>
          <Column style={{ fontWeight: 700, fontSize: "14px", paddingBottom: "8px" }}>Producto</Column>
          <Column style={{ fontWeight: 700, fontSize: "14px", paddingBottom: "8px", textAlign: "center" as const, width: "60px" }}>Cant.</Column>
          <Column style={{ fontWeight: 700, fontSize: "14px", paddingBottom: "8px", textAlign: "right" as const, width: "90px" }}>Total</Column>
        </Row>
      </Section>

      {/* Items */}
      {items.map((item, i) => {
        const isSub = item.metadata?.is_subscription === true
        return (
          <Section key={i} style={{ borderBottom: "1px solid #eeeeee" }}>
            <Row>
              <Column style={{ fontSize: "14px", padding: "8px 0" }}>
                {item.title}{isSub ? " 🔄 Suscripción" : ""}
              </Column>
              <Column style={{ fontSize: "14px", padding: "8px 0", textAlign: "center" as const, width: "60px" }}>
                {item.quantity}
              </Column>
              <Column style={{ fontSize: "14px", padding: "8px 0", textAlign: "right" as const, width: "90px" }}>
                {fmt(item.unit_price * item.quantity, currencyCode)}
              </Column>
            </Row>
          </Section>
        )
      })}

      {/* Total */}
      <Section>
        <Row>
          <Column style={{ textAlign: "right" as const, fontWeight: 700, paddingTop: "12px", paddingRight: "8px" }}>
            Total:
          </Column>
          <Column style={{ textAlign: "right" as const, fontWeight: 700, color: "#003D70", paddingTop: "12px", width: "90px" }}>
            {fmt(total, currencyCode)}
          </Column>
        </Row>
      </Section>

      <Heading as="h3" style={{ color: "#003D70", fontSize: "16px", marginTop: "24px" }}>
        Dirección de envío
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>{addressText}</Text>

      <Text style={{ color: "#1a1a1a" }}>
        Te notificaremos cuando tu pedido sea enviado.
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/emails/OrderConfirmation.tsx
git commit -m "feat(emails): add OrderConfirmation React Email template"
```

---

### Task 5: Build SubscriptionWelcome template

**Files:**
- Create: `src/emails/SubscriptionWelcome.tsx`

- [ ] **Step 1: Create the template**

```tsx
// src/emails/SubscriptionWelcome.tsx
import { Heading, Text, Html, Head, Body, Container } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type SubscriptionItem = {
  title: string
  interval_days: number
}

type Props = {
  name: string
  orderId: string | number
  subscriptionItems: SubscriptionItem[]
}

function intervalLabel(days: number) {
  if (days === 30) return "mensual"
  if (days === 60) return "bimestral"
  return "trimestral"
}

export function SubscriptionWelcome({ name, orderId, subscriptionItems }: Props) {
  return (
    <EmailLayout preview="¡Tu suscripción Novapatch está activa!">
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 8px" }}>
        Tu pedido <strong>#{orderId}</strong> fue confirmado y tu suscripción ya está activa.
      </Text>

      <Text style={{ color: "#1a1a1a", fontWeight: 600, margin: "16px 0 8px" }}>
        Productos suscritos:
      </Text>

      {subscriptionItems.map((item, i) => (
        <Text key={i} style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>
          · <strong>{item.title}</strong> — suscripción {intervalLabel(item.interval_days)}
        </Text>
      ))}

      <Text style={{ color: "#1a1a1a", marginTop: "20px" }}>
        Te cobraremos automáticamente en la fecha de tu próximo ciclo. Puedes pausar, cancelar o cambiar la frecuencia desde tu cuenta en{" "}
        <a href="https://novapatch.care/cuenta/suscripciones" style={{ color: "#17B8A3" }}>
          novapatch.care
        </a>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/emails/SubscriptionWelcome.tsx
git commit -m "feat(emails): add SubscriptionWelcome React Email template"
```

---

### Task 6: Build SubscriptionRenewed template

**Files:**
- Create: `src/emails/SubscriptionRenewed.tsx`

- [ ] **Step 1: Create the template**

```tsx
// src/emails/SubscriptionRenewed.tsx
import { Heading, Text, Row, Column, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type Props = {
  customerName: string
  amount: number
  currencyCode: string
  cycleNumber: number
  nextBillingDate: string   // ISO string
  openpayChargeId: string
}

export function SubscriptionRenewed({
  customerName,
  amount,
  currencyCode,
  cycleNumber,
  nextBillingDate,
  openpayChargeId,
}: Props) {
  const formattedAmount = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amount)

  const formattedDate = new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(nextBillingDate))

  const rows: [string, string][] = [
    ["Ciclo", String(cycleNumber)],
    ["Monto cobrado", formattedAmount],
    ["Referencia Openpay", openpayChargeId],
    ["Próximo cargo", formattedDate],
  ]

  return (
    <EmailLayout preview={`Novapatch — Cargo realizado: ${formattedAmount}`}>
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        Tu suscripción fue renovada
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Hola, {customerName || "cliente"}. Realizamos el cargo de{" "}
        <strong>{formattedAmount}</strong> a tu tarjeta registrada.
      </Text>

      {rows.map(([label, value], i) => (
        <Section key={i} style={{ borderBottom: "1px solid #eeeeee" }}>
          <Row>
            <Column style={{ color: "#6b7280", fontSize: "14px", padding: "8px 0" }}>{label}</Column>
            <Column style={{ fontSize: "14px", padding: "8px 0", textAlign: "right" as const }}>{value}</Column>
          </Row>
        </Section>
      ))}

      <Text style={{ color: "#1a1a1a", marginTop: "20px" }}>
        ¿Tienes alguna duda? Escríbenos a{" "}
        <a href="mailto:hola@novapatch.care" style={{ color: "#17B8A3" }}>
          hola@novapatch.care
        </a>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/emails/SubscriptionRenewed.tsx
git commit -m "feat(emails): add SubscriptionRenewed React Email template"
```

---

### Task 7: Build SubscriptionPaymentFailed template (urgent style)

**Files:**
- Create: `src/emails/SubscriptionPaymentFailed.tsx`

- [ ] **Step 1: Create the template**

```tsx
// src/emails/SubscriptionPaymentFailed.tsx
import { Heading, Text, Link, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type Props = {
  customerName: string
  reason: string
  error?: string
  frontendUrl: string
}

export function SubscriptionPaymentFailed({ customerName, reason, error, frontendUrl }: Props) {
  const reasonText =
    reason === "no_card"
      ? "No encontramos una tarjeta registrada en tu cuenta."
      : "El cargo a tu tarjeta fue rechazado."

  return (
    <EmailLayout preview="Novapatch — Problema con tu pago de suscripción">
      {/* Red-tinted header band */}
      <Section style={{ backgroundColor: "#FEF2F2", borderRadius: "6px", padding: "20px", marginBottom: "24px" }}>
        <EmailHeader />
        <Heading style={{ color: "#DC2626", fontSize: "22px", margin: "0 0 4px", textAlign: "center" as const }}>
          No pudimos procesar tu pago
        </Heading>
      </Section>

      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Hola, {customerName || "cliente"}.
      </Text>
      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Tuvimos un problema al cobrar tu suscripción Novapatch. Tu suscripción quedó pausada temporalmente para que puedas actualizar tu método de pago.
      </Text>

      {/* Alert box */}
      <Section
        style={{
          backgroundColor: "#FEF2F2",
          borderLeft: "4px solid #DC2626",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "0 0 20px",
        }}
      >
        <Text style={{ color: "#991b1b", fontSize: "14px", margin: 0 }}>
          {reasonText}
          {error ? ` Detalle: ${error}` : ""}
        </Text>
      </Section>

      <Text style={{ color: "#1a1a1a", fontWeight: 600, margin: "0 0 8px" }}>
        Para reactivar tu suscripción:
      </Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>1. Ingresa a tu cuenta en novapatch.care</Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>2. Ve a <strong>Mi cuenta → Suscripciones</strong></Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>3. Actualiza tu método de pago</Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0 20px", paddingLeft: "16px" }}>4. Reanuda tu suscripción</Text>

      {/* Navy CTA button (urgent, not cyan) */}
      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Link
          href={`${frontendUrl}/cuenta/suscripciones`}
          style={{
            backgroundColor: "#003D70",
            color: "#ffffff",
            padding: "12px 28px",
            borderRadius: "6px",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: "15px",
            display: "inline-block",
          }}
        >
          Actualizar método de pago
        </Link>
      </Section>

      <Text style={{ color: "#1a1a1a", marginTop: "8px" }}>
        ¿Necesitas ayuda? Escríbenos a{" "}
        <a href="mailto:hola@novapatch.care" style={{ color: "#17B8A3" }}>
          hola@novapatch.care
        </a>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/emails/SubscriptionPaymentFailed.tsx
git commit -m "feat(emails): add SubscriptionPaymentFailed React Email template"
```

---

### Task 8: Add renderEmail helper to resend.ts

**Files:**
- Modify: `src/lib/resend.ts`

Current file contents:
```ts
type SendEmailParams = {
  to: string
  subject: string
  html: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> { ... }
```

- [ ] **Step 1: Update resend.ts to add renderEmail**

Replace the full file content with:

```ts
import * as React from "react"
import { render } from "@react-email/components"

type SendEmailParams = {
  to: string
  subject: string
  html: string
}

export async function renderEmail(element: React.ReactElement): Promise<string> {
  return render(element)
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[Resend] RESEND_API_KEY not set — skipping email to", params.to)
    return
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Novapatch <hola@novapatch.care>"

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  })

  if (!response.ok) {
    let message = `Resend error ${response.status}`
    try {
      const body = (await response.json()) as { message?: string; name?: string }
      if (body.message) message = body.message
    } catch { /* non-JSON body */ }
    throw new Error(message)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/resend.ts
git commit -m "feat(emails): add renderEmail helper to resend lib"
```

---

### Task 9: Wire OrderConfirmation into subscriber

**Files:**
- Modify: `src/subscribers/order-confirmation-email.ts`

- [ ] **Step 1: Update the subscriber**

Replace the full file with:

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import { OrderConfirmation } from "../emails/OrderConfirmation"

export default async function orderConfirmationEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    }) as any

    if (!order) return

    const email = order.email
    if (!email) {
      logger.warn(`[order-confirmation] No email for order ${orderId}`)
      return
    }

    const name = order.shipping_address?.first_name ?? "Cliente"
    const displayId = order.display_id ?? orderId

    const html = await renderEmail(
      React.createElement(OrderConfirmation, {
        name,
        displayId,
        items: (order.items ?? []).map((item: any) => ({
          title: item.title ?? "",
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price ?? 0,
          metadata: item.metadata,
        })),
        shippingAddress: order.shipping_address ?? null,
        currencyCode: order.currency_code ?? "mxn",
      })
    )

    await sendEmail({
      to: email,
      subject: `Pedido #${displayId} confirmado — Novapatch`,
      html,
    })

    logger.info(`[order-confirmation] Email enviado a ${email} para orden #${displayId}`)
  } catch (err) {
    logger.error(
      `[order-confirmation] Error enviando email para orden ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-confirmation-email",
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/subscribers/order-confirmation-email.ts
git commit -m "feat(emails): wire OrderConfirmation template into subscriber"
```

---

### Task 10: Wire SubscriptionWelcome into subscriber

**Files:**
- Modify: `src/subscribers/subscription-welcome-email.ts`

- [ ] **Step 1: Update the subscriber**

Replace the full file with:

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import { SubscriptionWelcome } from "../emails/SubscriptionWelcome"

export default async function subscriptionWelcomeEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items"],
    }) as any

    const subscriptionItems = (order.items ?? []).filter(
      (item: any) => item.metadata?.is_subscription === true
    )

    if (subscriptionItems.length === 0) return

    const customerService = container.resolve(Modules.CUSTOMER)
    const customers = order.customer_id
      ? await customerService.listCustomers({ id: order.customer_id })
      : []
    const customer = customers[0]
    const email = customer?.email ?? order.email
    const name = customer?.first_name ?? "Cliente"

    if (!email) return

    const html = await renderEmail(
      React.createElement(SubscriptionWelcome, {
        name,
        orderId: order.display_id ?? orderId,
        subscriptionItems: subscriptionItems.map((item: any) => ({
          title: item.title ?? "",
          interval_days: Number(item.metadata?.interval_days ?? 30),
        })),
      })
    )

    await sendEmail({
      to: email,
      subject: "¡Bienvenido a Novapatch! Tu suscripción está activa",
      html,
    })

    logger.info(`[subscription-welcome] Email enviado a ${email} para orden ${orderId}`)
  } catch (err) {
    logger.error(
      `[subscription-welcome] Error enviando email para orden ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "subscription-welcome-email",
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/subscribers/subscription-welcome-email.ts
git commit -m "feat(emails): wire SubscriptionWelcome template into subscriber"
```

---

### Task 11: Wire SubscriptionRenewed into subscriber

**Files:**
- Modify: `src/subscribers/subscription-renewed-email.ts`

- [ ] **Step 1: Update the subscriber**

Replace the full file with:

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import { SubscriptionRenewed } from "../emails/SubscriptionRenewed"

type RenewedEventData = {
  subscription_id: string
  order_id: string
  cycle_number: number
  amount: number
  currency_code: string
  customer_email: string
  customer_name: string
  next_billing_date: string
  openpay_charge_id: string
}

export default async function subscriptionRenewedEmailHandler({
  event,
  container,
}: SubscriberArgs<RenewedEventData>) {
  const data = event.data
  const logger = container.resolve("logger")

  try {
    const formattedAmount = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: data.currency_code.toUpperCase(),
    }).format(data.amount)

    const html = await renderEmail(
      React.createElement(SubscriptionRenewed, {
        customerName: data.customer_name,
        amount: data.amount,
        currencyCode: data.currency_code,
        cycleNumber: data.cycle_number,
        nextBillingDate: data.next_billing_date,
        openpayChargeId: data.openpay_charge_id,
      })
    )

    await sendEmail({
      to: data.customer_email,
      subject: `Novapatch — Cargo realizado: ${formattedAmount}`,
      html,
    })

    logger.info(
      `[subscription-renewed] Email enviado a ${data.customer_email} para suscripción ${data.subscription_id}`
    )
  } catch (err) {
    logger.error(
      `[subscription-renewed] Error enviando email para suscripción ${data.subscription_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.renewed",
  context: {
    subscriberId: "subscription-renewed-email",
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/subscribers/subscription-renewed-email.ts
git commit -m "feat(emails): wire SubscriptionRenewed template into subscriber"
```

---

### Task 12: Wire SubscriptionPaymentFailed into subscriber

**Files:**
- Modify: `src/subscribers/subscription-payment-failed-email.ts`

- [ ] **Step 1: Update the subscriber**

Replace the full file with:

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import { SubscriptionPaymentFailed } from "../emails/SubscriptionPaymentFailed"

type PaymentFailedEventData = {
  subscription_id: string
  reason: string
  error?: string
  customer_email: string
  customer_name: string
  amount?: number
}

export default async function subscriptionPaymentFailedEmailHandler({
  event,
  container,
}: SubscriberArgs<PaymentFailedEventData>) {
  const data = event.data
  const logger = container.resolve("logger")

  try {
    const frontendUrl = process.env.STORE_CORS ?? "https://novapatch.care"

    const html = await renderEmail(
      React.createElement(SubscriptionPaymentFailed, {
        customerName: data.customer_name,
        reason: data.reason,
        error: data.error,
        frontendUrl,
      })
    )

    await sendEmail({
      to: data.customer_email,
      subject: "Novapatch — Problema con tu pago de suscripción",
      html,
    })

    logger.info(
      `[subscription-payment-failed] Email enviado a ${data.customer_email} para suscripción ${data.subscription_id}`
    )
  } catch (err) {
    logger.error(
      `[subscription-payment-failed] Error enviando email para suscripción ${data.subscription_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.payment_failed",
  context: {
    subscriberId: "subscription-payment-failed-email",
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/subscribers/subscription-payment-failed-email.ts
git commit -m "feat(emails): wire SubscriptionPaymentFailed template into subscriber"
```

---

### Task 13: Final build verification and push

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Start dev server to verify no runtime errors at boot**

```bash
npx medusa develop 2>&1 | head -30
```

Expected: server starts, no import errors.

- [ ] **Step 3: Push to trigger Railway deploy**

```bash
git push
```

Expected: pushed to main, Railway picks up the changes.
