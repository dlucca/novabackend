# Fulfillment Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three gaps in the fulfillment flow: subscription renewal orders must generate an Envia label automatically, customers must receive a tracking email when their shipment is created, and the Envia webhook must send delivery/failed emails.

**Architecture:** (1) Store `order_id` in fulfillment metadata so the webhook can resolve the order without extra queries. (2) New subscriber on `order.fulfillment_created` sends a tracking email — covers both first purchase and renewals via the same code path. (3) Billing step calls `enviaCreateFulfillmentWorkflow` directly after creating the renewal order. (4) Envia webhook uses `fulfillment.metadata.order_id` to send delivery/failed emails.

**Tech Stack:** Medusa.js v2, TypeScript, React Email (`@react-email/components`), Resend (via `src/lib/resend.ts`), Envia API (via existing workflow).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts` | Add `order_id` to fulfillment metadata |
| Create | `src/emails/OrderShipped.tsx` | "En camino" email template with tracking info |
| Create | `src/subscribers/order-shipped-email.ts` | Send tracking email on `order.fulfillment_created` |
| Create | `src/emails/OrderDelivered.tsx` | "Entregado" email template |
| Create | `src/emails/OrderDeliveryFailed.tsx` | "Entrega fallida/devuelto" email template |
| Modify | `src/api/webhooks/envia/route.ts` | Send delivery/failed emails inside `processEvent` |
| Modify | `src/workflows/process-billing-cycle/steps/process-billing.ts` | Call `enviaCreateFulfillmentWorkflow` after billing succeeds |

---

## Task 1: Store `order_id` in fulfillment metadata

This is a prerequisite for Task 6. The Envia webhook finds a fulfillment by tracking number but has no direct access to the order. Storing `order_id` in metadata makes it trivially available.

**Files:**
- Modify: `src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts`

- [ ] **Step 1: Open the file and add `order_id` to the metadata object**

  In `createMedusaFulfillmentStep`, inside the `createOrderFulfillmentWorkflow` call, the `metadata` object currently starts at `envia_shipment_id`. Add `order_id: order.id` as the first field:

  ```ts
  metadata: {
    order_id: order.id,                              // ← add this line
    envia_shipment_id: String(shipment.shipmentId),
    envia_track_url: shipment.trackUrl,
    envia_label_url: shipment.label,
    carrier: shipment.carrier,
    service: shipment.service,
    envia_carrier_cost: String(shipment.totalPrice),
    envia_currency: shipment.currency,
  },
  ```

- [ ] **Step 2: Verify the server starts without TypeScript errors**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/workflows/envia-create-fulfillment/steps/create-fulfillment.ts
  git commit -m "feat(fulfillment): store order_id in fulfillment metadata"
  ```

---

## Task 2: Create `OrderShipped.tsx` email template

Shows the tracking number, a CTA button to the carrier tracking page, and the `OrderStatusTracker` at step 2 ("En camino").

**Files:**
- Create: `src/emails/OrderShipped.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  // src/emails/OrderShipped.tsx
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
    trackingUrl: string
    carrier: string
  }

  export default function OrderShipped({
    name,
    displayId,
    trackingNumber,
    trackingUrl,
    carrier,
  }: Props) {
    return (
      <EmailLayout preview={`Tu pedido #${displayId} está en camino — Novapatch`}>
        <EmailHeader />

        <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
          ¡Hola, {name}!
        </Heading>
        <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
          Tu pedido #{displayId} está en camino
        </Text>

        <OrderStatusTracker currentStep={2} trackingUrl={trackingUrl} />

        <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

        <Section style={{ backgroundColor: "#F9FAFB", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
          <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 6px" }}>
            Número de guía
          </Text>
          <Text style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: "0 0 4px" }}>
            {trackingNumber}
          </Text>
          <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
            Transportista: {carrier}
          </Text>
        </Section>

        <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
          <Button
            href={trackingUrl}
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
            Rastrear mi pedido
          </Button>
        </Section>

        <EmailFooter />
      </EmailLayout>
    )
  }

  OrderShipped.defaultProps = {
    name: "Ramiro",
    displayId: "1042",
    trackingNumber: "1Z999AA10123456784",
    trackingUrl: "https://noventa9minutos.mx/rastreo/1Z999AA10123456784",
    carrier: "noventa9minutos",
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/emails/OrderShipped.tsx
  git commit -m "feat(emails): add OrderShipped template"
  ```

---

## Task 3: Create `order-shipped-email.ts` subscriber

Listens on `order.fulfillment_created`. In Medusa v2, this event emits `{ id: order_id }`. The subscriber fetches the order for customer info and the order's fulfillments for tracking info.

**Files:**
- Create: `src/subscribers/order-shipped-email.ts`

- [ ] **Step 1: Create the subscriber file**

  ```ts
  // src/subscribers/order-shipped-email.ts
  import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
  import { Modules } from "@medusajs/framework/utils"
  import * as React from "react"
  import { sendEmail, renderEmail } from "../lib/resend"
  import OrderShipped from "../emails/OrderShipped"

  export default async function orderShippedEmailHandler({
    event,
    container,
  }: SubscriberArgs<{ id: string }>) {
    const orderId = event.data.id
    const logger = container.resolve("logger")

    try {
      const orderService = container.resolve(Modules.ORDER)
      const fulfillmentService = container.resolve(Modules.FULFILLMENT)

      const order = await orderService.retrieveOrder(orderId, {
        relations: ["shipping_address"],
      }) as any

      if (!order?.email) {
        logger.warn(`[order-shipped] No email for order ${orderId}`)
        return
      }

      // Get all fulfillments for this order, pick the most recent one
      const fulfillments = await fulfillmentService.listFulfillments(
        { order_id: orderId },
        { relations: ["labels"] }
      ) as any[]

      if (!fulfillments.length) {
        logger.warn(`[order-shipped] No fulfillments found for order ${orderId}`)
        return
      }

      const fulfillment = fulfillments[fulfillments.length - 1]
      const label = fulfillment.labels?.[0]

      if (!label?.tracking_number) {
        logger.warn(`[order-shipped] No tracking label for order ${orderId}`)
        return
      }

      const name = order.shipping_address?.first_name ?? "Cliente"
      const displayId = order.display_id ?? orderId
      const carrier = fulfillment.metadata?.carrier ?? "carrier"

      const html = await renderEmail(
        React.createElement(OrderShipped, {
          name,
          displayId,
          trackingNumber: label.tracking_number,
          trackingUrl: label.tracking_url ?? `https://novapatch.care/rastreo/${label.tracking_number}`,
          carrier,
        })
      )

      await sendEmail({
        to: order.email,
        subject: `Tu pedido #${displayId} está en camino — Novapatch`,
        html,
      })

      logger.info(`[order-shipped] Email enviado a ${order.email} para orden #${displayId}`)
    } catch (err) {
      logger.error(
        `[order-shipped] Error enviando email para orden ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  export const config: SubscriberConfig = {
    event: "order.fulfillment_created",
    context: {
      subscriberId: "order-shipped-email",
    },
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Start the dev server and place a test order to verify the email fires**

  ```bash
  npx medusa develop
  ```

  Trigger the flow: complete a checkout (or use the admin to manually mark an order as fulfilled). Check the server logs for:
  ```
  [order-shipped] Email enviado a <email> para orden #<id>
  ```
  If `RESEND_API_KEY` is not set, you'll see the warning from `sendEmail` instead — that's expected in local dev.

- [ ] **Step 4: Commit**

  ```bash
  git add src/subscribers/order-shipped-email.ts
  git commit -m "feat(subscribers): send tracking email on order.fulfillment_created"
  ```

---

## Task 4: Create `OrderDelivered.tsx` email template

**Files:**
- Create: `src/emails/OrderDelivered.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  // src/emails/OrderDelivered.tsx
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
  }

  export default function OrderDelivered({ name, displayId, trackingNumber }: Props) {
    const storeUrl = process.env.STORE_CORS ?? "https://novapatch.care"

    return (
      <EmailLayout preview={`Tu pedido #${displayId} fue entregado — Novapatch`}>
        <EmailHeader />

        <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
          ¡Hola, {name}!
        </Heading>
        <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
          Tu pedido #{displayId} fue entregado
        </Text>

        <OrderStatusTracker currentStep={3} />

        <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

        <Section style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: "#15803D", margin: "0 0 4px", fontWeight: 600 }}>
            ¡Entregado con éxito!
          </Text>
          <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
            Guía: {trackingNumber}
          </Text>
        </Section>

        <Text style={{ fontSize: 14, color: GRAY, margin: "0 0 24px" }}>
          Esperamos que disfrutes tu Novapatch. Si tienes algún problema con tu pedido, escríbenos a hola@novapatch.care.
        </Text>

        <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
          <Button
            href={`${storeUrl}/tienda`}
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
            Ver más productos
          </Button>
        </Section>

        <EmailFooter />
      </EmailLayout>
    )
  }

  OrderDelivered.defaultProps = {
    name: "Ramiro",
    displayId: "1042",
    trackingNumber: "1Z999AA10123456784",
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/emails/OrderDelivered.tsx
  git commit -m "feat(emails): add OrderDelivered template"
  ```

---

## Task 5: Create `OrderDeliveryFailed.tsx` email template

**Files:**
- Create: `src/emails/OrderDeliveryFailed.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  // src/emails/OrderDeliveryFailed.tsx
  import { Heading, Text, Section, Button, Hr } from "@react-email/components"
  import * as React from "react"
  import { EmailLayout } from "./components/EmailLayout"
  import { EmailHeader } from "./components/EmailHeader"
  import { EmailFooter } from "./components/EmailFooter"

  const NAVY = "#003D70"
  const CORAL = "#E8503A"
  const GRAY = "#6B7280"

  type Props = {
    name: string
    displayId: string | number
    trackingNumber: string
    status: "failed" | "returned"
  }

  export default function OrderDeliveryFailed({ name, displayId, trackingNumber, status }: Props) {
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

        <Hr style={{ borderColor: "#E5E7EB", margin: "20px 0" }} />

        <Section style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: "#DC2626", margin: "0 0 4px", fontWeight: 600 }}>
            {isReturned ? "Pedido devuelto" : "Entrega fallida"}
          </Text>
          <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
            Guía: {trackingNumber}
          </Text>
        </Section>

        <Text style={{ fontSize: 14, color: GRAY, margin: "0 0 24px" }}>
          {bodyText}
        </Text>

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
    status: "failed",
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/emails/OrderDeliveryFailed.tsx
  git commit -m "feat(emails): add OrderDeliveryFailed template"
  ```

---

## Task 6: Update Envia webhook to send delivery/failed emails

The webhook already finds the fulfillment by tracking number and updates its metadata. Now extend `processEvent` to also send emails for terminal statuses (`delivered`, `failed`, `returned`).

**Files:**
- Modify: `src/api/webhooks/envia/route.ts`

- [ ] **Step 1: Add imports at the top of the file**

  After the existing imports (`crypto`, `ioredis`) add — note `Modules` is already imported at line 2, do not duplicate it:

  ```ts
  import * as React from "react"
  import { sendEmail, renderEmail } from "../../../lib/resend"
  import OrderDelivered from "../../../emails/OrderDelivered"
  import OrderDeliveryFailed from "../../../emails/OrderDeliveryFailed"
  ```

- [ ] **Step 2: Replace the `delivered` and `failed/returned` blocks in `processEvent`**

  Find the current block at the bottom of `processEvent` (lines ~83–91):

  ```ts
  if (status === "delivered") {
    logger.info(`[envia-webhook] Order delivered — tracking ${trackingNumber}`)
  } else if (status === "failed" || status === "returned") {
    logger.warn(
      `[envia-webhook] Shipment issue (${status}) for tracking ${trackingNumber} — manual review required`
    )
  }
  ```

  Replace it with:

  ```ts
  if (status === "delivered" || status === "failed" || status === "returned") {
    const orderId = fulfillment.metadata?.order_id as string | undefined

    if (!orderId) {
      logger.warn(`[envia-webhook] No order_id in fulfillment metadata for tracking ${trackingNumber} — skipping email`)
    } else {
      try {
        const orderService = container.resolve(Modules.ORDER)
        const order = await orderService.retrieveOrder(orderId, {
          relations: ["shipping_address"],
        }) as any

        const customerEmail = order?.email
        const customerName = order?.shipping_address?.first_name ?? "Cliente"
        const displayId = order?.display_id ?? orderId

        if (customerEmail) {
          let html: string
          let subject: string

          if (status === "delivered") {
            html = await renderEmail(
              React.createElement(OrderDelivered, { name: customerName, displayId, trackingNumber })
            )
            subject = `Tu pedido #${displayId} fue entregado — Novapatch`
          } else {
            html = await renderEmail(
              React.createElement(OrderDeliveryFailed, {
                name: customerName,
                displayId,
                trackingNumber,
                status: status as "failed" | "returned",
              })
            )
            subject = `Problema con la entrega de tu pedido #${displayId} — Novapatch`
          }

          await sendEmail({ to: customerEmail, subject, html })
          logger.info(`[envia-webhook] Email de ${status} enviado a ${customerEmail} para orden #${displayId}`)
        }
      } catch (emailErr) {
        // Never throw from webhook — 200 was already sent to Envia
        logger.error(
          `[envia-webhook] Failed to send ${status} email for tracking ${trackingNumber}: ${
            emailErr instanceof Error ? emailErr.message : String(emailErr)
          }`
        )
      }
    }
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Test with a simulated webhook POST**

  Start the dev server:
  ```bash
  npx medusa develop
  ```

  Simulate a delivered event:
  ```bash
  curl -X POST http://localhost:9000/webhooks/envia \
    -H "Content-Type: application/json" \
    -d '{"trackingNumber":"TEST123","status":"delivered"}'
  ```

  Expected response: `{"received":true}` immediately.
  In server logs: `[envia-webhook] No order_id in fulfillment metadata for tracking TEST123 — skipping email` (expected since TEST123 doesn't exist). No crash.

- [ ] **Step 5: Commit**

  ```bash
  git add src/api/webhooks/envia/route.ts
  git commit -m "feat(webhooks): send delivery/failed emails from Envia webhook"
  ```

---

## Task 7: Call Envia fulfillment from subscription billing step

This closes the main gap: renewal orders currently never generate a shipping label.

**Files:**
- Modify: `src/workflows/process-billing-cycle/steps/process-billing.ts`

- [ ] **Step 1: Add the import at the top of the file**

  After the existing imports add:

  ```ts
  import { enviaCreateFulfillmentWorkflow } from "../../envia-create-fulfillment"
  ```

- [ ] **Step 2: Add the Envia call after the `subscription.renewed` emit**

  Find the `subscription.renewed` emit block (currently the last meaningful step before the return, around line 253). After that `eventBus.emit` call, add:

  ```ts
  // Generate shipping label — best-effort, does not roll back the charge if it fails
  if (process.env.ENVIA_API_TOKEN && process.env.ENVIA_API_URL) {
    try {
      await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId: renewalOrder.id } })
      logger.info(`${LOG} Envia fulfillment created for renewal order ${renewalOrder.id}`)
    } catch (enviaErr) {
      logger.error(
        `${LOG} Envia fulfillment failed for renewal order ${renewalOrder.id}: ${
          enviaErr instanceof Error ? enviaErr.message : String(enviaErr)
        } — operator can generate label manually`
      )
    }
  } else {
    logger.warn(`${LOG} ENVIA_API_TOKEN/URL not set — skipping fulfillment for renewal order ${renewalOrder.id}`)
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Verify the billing step still returns success even when Envia is not configured**

  With `ENVIA_API_TOKEN` unset (local dev), run a billing cycle manually via exec script or confirm the warning log appears instead of an error.

  In server logs, a subscription billing without Envia configured should show:
  ```
  [process-billing] <id> ENVIA_API_TOKEN/URL not set — skipping fulfillment for renewal order <id>
  ```
  And the billing result should still be `{ success: true }`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/workflows/process-billing-cycle/steps/process-billing.ts
  git commit -m "feat(billing): trigger Envia fulfillment for subscription renewal orders"
  ```

---

## Final Verification

- [ ] **Run TypeScript check on the full project**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors across all modified and new files.

- [ ] **Start dev server and smoke test the complete flow**

  ```bash
  npx medusa develop
  ```

  Checklist:
  1. Place a new order via the frontend → check for `[order-shipped] Email enviado` in logs after payment is captured
  2. Send a simulated Envia `delivered` webhook → check for `[envia-webhook] Email de delivered enviado` (requires a real fulfillment with `order_id` in metadata)
  3. Send a simulated Envia `failed` webhook → check for `[envia-webhook] Email de failed enviado`
  4. Confirm no unhandled exceptions in any of the above flows

- [ ] **Commit any remaining changes and push**

  ```bash
  git push
  ```
