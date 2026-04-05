# React Email Branding — Design Spec
**Date:** 2026-04-05

## Overview

Migrate all 4 transactional email templates from raw HTML strings to React Email components with consistent Novapatch branding. Currently emails use inline HTML with inconsistent colors (#005088 vs #7c3aed) and no shared layout.

## Brand Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Navy | `#003D70` | Titles, totals, urgent CTA buttons |
| Cyan | `#17B8A3` | Accent, buttons, badges, header divider |
| Red | `#DC2626` | Payment failed title and alert |
| Red bg | `#FEF2F2` | Payment failed header band |
| Body text | `#1a1a1a` | Main content |
| Muted | `#6b7280` | Footer, secondary text |
| Background | `#f5f5f5` | Page background |
| Card | `#ffffff` | Email card |

**Font:** Montserrat (Google Fonts) — weights 400, 600, 700. Loaded via `@react-email/components` `<Font>` component.

**Logo:** `https://res.cloudinary.com/dxnoqul2v/image/upload/f_auto,q_auto/logonova_chs6v3` (PNG via Cloudinary, auto-format/quality)

## Architecture

```
src/emails/
├── components/
│   ├── EmailLayout.tsx         # Html, Head, Font, Body, Container wrapper
│   ├── EmailHeader.tsx         # Logo image, cyan divider line
│   └── EmailFooter.tsx         # "Novapatch · Ciudad de México · novapatch.care"
├── OrderConfirmation.tsx       # Props: order (id, display_id, email, items, shipping_address, currency_code)
├── SubscriptionWelcome.tsx     # Props: name, orderId, subscriptionItems[]
├── SubscriptionRenewed.tsx     # Props: customerName, amount, currencyCode, cycleNumber, nextBillingDate, chargeId
└── SubscriptionPaymentFailed.tsx # Props: customerName, reason, error?, frontendUrl
```

### EmailLayout
- Wraps all templates: `<Html lang="es">`, `<Head>` with `<Font>` (Montserrat from Google Fonts), `<Preview>` text slot, `<Body>` with `#f5f5f5` background
- Inner `<Container>` max-width 600px, white background, border-radius 8px, padding 32px

### EmailHeader
- `<Img>` pointing to Cloudinary PNG, width 140px, centered
- Thin cyan `#17B8A3` horizontal rule below logo (2px)

### EmailFooter
- Muted gray text: `Novapatch · Ciudad de México ·` + `<Link>` to novapatch.care

## Templates

### OrderConfirmation
- Title: "¡Gracias por tu compra, {name}!" in navy
- Items table: product name (+ "🔄 Suscripción" badge if `metadata.is_subscription`), quantity, unit price
- Total row in navy/bold — calculated from `items.reduce(unit_price * quantity)`
- Shipping address block
- "Te notificaremos cuando tu pedido sea enviado."

### SubscriptionWelcome
- Title: "¡Hola, {name}! Tu suscripción está activa" in navy
- Bullet list of subscribed products with interval label (mensual/bimestral/trimestral)
- Short paragraph about automatic billing and account management link

### SubscriptionRenewed
- Title: "Tu suscripción fue renovada" in navy
- Summary table: cycle number, amount charged, Openpay reference, next billing date
- "¿Tienes alguna duda?" with mailto link

### SubscriptionPaymentFailed (distinct style)
- Header band background: `#FEF2F2` (light red) instead of white card
- Title: "No pudimos procesar tu pago" in `#DC2626`
- Alert box: left border `#DC2626`, background `#FEF2F2`, reason text
- Numbered steps to reactivate subscription
- CTA button in navy `#003D70` (not cyan) — "Actualizar método de pago"

## Dependency

```
@react-email/components  (latest)
```

React 18 is already installed. No additional peer deps needed.

## `src/lib/resend.ts` update

Add `renderEmail(element: React.ReactElement): Promise<string>` helper that calls `render()` from `@react-email/components` and returns the HTML string. The existing `sendEmail({ to, subject, html })` signature is unchanged — subscribers call `renderEmail()` then pass the result to `sendEmail()`.

## Subscriber updates

Each of the 4 subscribers (`order-confirmation-email.ts`, `subscription-welcome-email.ts`, `subscription-renewed-email.ts`, `subscription-payment-failed-email.ts`) replaces its inline HTML string with an import of the corresponding template component and a call to `renderEmail(<Template {...props} />)`.

## Error handling

No change to error handling logic. Template rendering errors are caught by the existing try/catch in each subscriber and logged.

## Out of scope

- Preview server (`email dev` CLI) — useful for development but not required for production
- `subscription.upcoming_charge` email — not yet implemented, out of scope for this migration
- Dark mode email variants
