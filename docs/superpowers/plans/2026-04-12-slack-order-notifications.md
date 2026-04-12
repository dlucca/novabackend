# Slack Order Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the Novapatch internal Slack channel every time a new order is placed in Medusa.

**Architecture:** A new subscriber `order-placed-slack.ts` listens to `order.placed` and coordinates two pure functions — `mapOrderToSlackBlocks` (transforms order data to Slack Block Kit) and `sendSlackNotification` (HTTP POST to the webhook). The subscriber never throws; Slack failures are logged and do not affect orders.

**Tech Stack:** TypeScript, Medusa v2 Event Bus (`order.placed`), native `fetch`, Slack Incoming Webhooks, Block Kit, Jest + SWC

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/slack-mappers.ts` | Transform a Medusa order object into Slack Block Kit blocks |
| Create | `src/lib/slack-client.ts` | POST Block Kit payload to `SLACK_ORDERS_WEBHOOK_URL` |
| Create | `src/subscribers/order-placed-slack.ts` | Listen to `order.placed`, coordinate mapper + client |
| Create | `src/__tests__/lib/slack-mappers.unit.spec.ts` | Unit tests for the mapper |

---

## Task 1: Write failing tests for `mapOrderToSlackBlocks`

**Files:**
- Create: `src/__tests__/lib/slack-mappers.unit.spec.ts`

- [ ] **Step 1: Create the test file**

```ts
// src/__tests__/lib/slack-mappers.unit.spec.ts
import { mapOrderToSlackBlocks } from "../../lib/slack-mappers"

const baseOrder = {
  id: "order_abc123",
  display_id: 1024,
  created_at: "2026-04-12T13:42:00.000Z",
  email: "juan@example.com",
  currency_code: "mxn",
  total: 150000,
  shipping_address: {
    first_name: "Juan",
    last_name: "Pérez",
    city: "CDMX",
    province: "Ciudad de México",
    country_code: "MX",
  },
  items: [
    { title: "Energy", quantity: 1, metadata: {} },
    { title: "Sleep", quantity: 2, metadata: {} },
  ],
}

describe("mapOrderToSlackBlocks", () => {
  it("returns a non-empty array of blocks", () => {
    const blocks = mapOrderToSlackBlocks(baseOrder)
    expect(Array.isArray(blocks)).toBe(true)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it("includes order display_id in message", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("#1024")
  })

  it("falls back to order.id when display_id is null", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks({ ...baseOrder, display_id: null }))
    expect(text).toContain("order_abc123")
  })

  it("includes customer full name", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("Juan Pérez")
  })

  it("shows (sin nombre) when shipping_address is null", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks({ ...baseOrder, shipping_address: null }))
    expect(text).toContain("(sin nombre)")
  })

  it("includes email", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("juan@example.com")
  })

  it("shows (sin email) when email is null", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks({ ...baseOrder, email: null }))
    expect(text).toContain("(sin email)")
  })

  it("includes all product titles and quantities", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("Energy")
    expect(text).toContain("x1")
    expect(text).toContain("Sleep")
    expect(text).toContain("x2")
  })

  it("formats total dividing by 100", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("1,500")
  })

  it("shows currency code in uppercase", () => {
    const text = JSON.stringify(mapOrderToSlackBlocks(baseOrder))
    expect(text).toContain("MXN")
  })

  it("handles non-MXN currency", () => {
    const text = JSON.stringify(
      mapOrderToSlackBlocks({ ...baseOrder, currency_code: "brl", total: 50000 })
    )
    expect(text).toContain("BRL")
    expect(text).toContain("500")
  })

  it("handles multiple items without throwing", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy", quantity: 1, metadata: {} },
        { title: "Sleep", quantity: 2, metadata: {} },
        { title: "Glow", quantity: 3, metadata: {} },
      ],
    }
    expect(() => mapOrderToSlackBlocks(order)).not.toThrow()
    const text = JSON.stringify(mapOrderToSlackBlocks(order))
    expect(text).toContain("Glow")
    expect(text).toContain("x3")
  })

  it("excludes items with metadata.is_shipping from products list", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy", quantity: 1, metadata: {} },
        { title: "Envío", quantity: 1, metadata: { is_shipping: true } },
      ],
    }
    const text = JSON.stringify(mapOrderToSlackBlocks(order))
    expect(text).toContain("Energy")
    expect(text).not.toContain("Envío")
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test:unit 2>&1 | grep -E "(FAIL|PASS|Cannot find|mapOrderToSlackBlocks)"
```

Expected: `Cannot find module '../../lib/slack-mappers'` or similar import error.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/__tests__/lib/slack-mappers.unit.spec.ts
git commit -m "test(slack): add failing unit tests for mapOrderToSlackBlocks"
```

---

## Task 2: Implement `slack-mappers.ts`

**Files:**
- Create: `src/lib/slack-mappers.ts`

- [ ] **Step 1: Create the mapper**

```ts
// src/lib/slack-mappers.ts

export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji: boolean } }
  | { type: "divider" }
  | {
      type: "section"
      text?: { type: "mrkdwn"; text: string }
      fields?: Array<{ type: "mrkdwn"; text: string }>
    }

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateStr ?? ""
  }
}

function formatTotal(total: number, currencyCode: string): string {
  const amount = Number(total ?? 0) / 100
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
      currencyDisplay: "code",
    }).format(amount)
  } catch {
    return `${currencyCode.toUpperCase()} ${amount.toFixed(2)}`
  }
}

export function mapOrderToSlackBlocks(order: any): SlackBlock[] {
  const displayId = order.display_id ? `#${order.display_id}` : order.id

  const addr = order.shipping_address
  const firstName = addr?.first_name ?? ""
  const lastName = addr?.last_name ?? ""
  const clienteName = (firstName + " " + lastName).trim() || "(sin nombre)"

  const email = order.email || "(sin email)"

  const city = addr?.city ?? ""
  const province = addr?.province ?? ""
  const country = addr?.country_code?.toUpperCase() ?? ""
  const locationParts = [city, province].filter(Boolean)
  const location =
    locationParts.length > 0
      ? `${locationParts.join(", ")} · ${country}`
      : country || "(sin ubicación)"

  const items = (order.items ?? []).filter(
    (item: any) => !item.metadata?.is_shipping && !item.is_shipping_cost
  )

  const productsList =
    items.map((item: any) => `• ${item.title} x${item.quantity}`).join("\n") || "—"

  const total = formatTotal(order.total ?? 0, order.currency_code ?? "mxn")
  const date = formatDate(order.created_at)

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🛍️ Nueva orden recibida", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Orden*\n${displayId}` },
        { type: "mrkdwn", text: `*Fecha*\n${date}` },
        { type: "mrkdwn", text: `*Cliente*\n${clienteName}` },
        { type: "mrkdwn", text: `*Email*\n${email}` },
        { type: "mrkdwn", text: `*Ubicación*\n${location}` },
        { type: "mrkdwn", text: `*Items*\n${items.length}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Productos*\n${productsList}` },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Total*   ${total}` },
    },
  ]
}
```

- [ ] **Step 2: Run tests — confirm they pass**

```bash
npm run test:unit 2>&1 | grep -E "(FAIL|PASS|✓|✗|slack-mappers)"
```

Expected: `PASS src/__tests__/lib/slack-mappers.unit.spec.ts` with all 13 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/slack-mappers.ts
git commit -m "feat(slack): implement mapOrderToSlackBlocks with Block Kit format"
```

---

## Task 3: Implement `slack-client.ts`

**Files:**
- Create: `src/lib/slack-client.ts`

No unit test for this file — it is pure I/O coordination (a single `fetch` call). It will be covered by the manual end-to-end test in Task 5.

- [ ] **Step 1: Create the client**

```ts
// src/lib/slack-client.ts
import type { SlackBlock } from "./slack-mappers"

export async function sendSlackNotification(blocks: SlackBlock[]): Promise<void> {
  const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error("SLACK_ORDERS_WEBHOOK_URL is not configured")
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  })

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`)
  }
}
```

- [ ] **Step 2: Run unit tests to confirm nothing broke**

```bash
npm run test:unit 2>&1 | grep -E "(FAIL|PASS)"
```

Expected: all tests still passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/slack-client.ts
git commit -m "feat(slack): implement sendSlackNotification webhook client"
```

---

## Task 4: Implement the subscriber

**Files:**
- Create: `src/subscribers/order-placed-slack.ts`

- [ ] **Step 1: Create the subscriber**

```ts
// src/subscribers/order-placed-slack.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { mapOrderToSlackBlocks } from "../lib/slack-mappers"
import { sendSlackNotification } from "../lib/slack-client"

export default async function orderPlacedSlackHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  let logger: any
  try {
    logger = container.resolve("logger")
  } catch {
    logger = console
  }

  if (!process.env.SLACK_ORDERS_WEBHOOK_URL) {
    logger.warn(
      "[order-placed-slack] SLACK_ORDERS_WEBHOOK_URL not configured — skipping notification"
    )
    return
  }

  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = (await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    })) as any

    if (!order) return

    const blocks = mapOrderToSlackBlocks(order)
    await sendSlackNotification(blocks)

    logger.info(
      `[order-placed-slack] Notificación enviada para orden #${order.display_id ?? orderId}`
    )
  } catch (err) {
    logger.error(
      `[order-placed-slack] Failed to notify Slack for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-placed-slack-notification",
  },
}
```

- [ ] **Step 2: Run unit tests to confirm nothing broke**

```bash
npm run test:unit 2>&1 | grep -E "(FAIL|PASS)"
```

Expected: all tests still passing.

- [ ] **Step 3: Commit**

```bash
git add src/subscribers/order-placed-slack.ts
git commit -m "feat(slack): add order-placed-slack subscriber for Slack notifications"
```

---

## Task 5: Configure env var and end-to-end test

**Files:**
- Modify: `.env` (local only — never commit)

- [ ] **Step 1: Add the env var to `.env`**

Open `.env` in the project root and add:

```
SLACK_ORDERS_WEBHOOK_URL=https://hooks.slack.com/services/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
```

- [ ] **Step 2: Confirm `.env` is in `.gitignore`**

```bash
grep -n "\.env" /Users/dlucca/Projects/Novapatch/novabackend/.gitignore
```

Expected: `.env` appears in the gitignore list. If it does not, add it before continuing.

- [ ] **Step 3: Start the dev server**

```bash
npx medusa develop
```

Wait for `Server is ready on port: 9000`.

- [ ] **Step 4: Place a test order via the API**

In a new terminal, create a cart, add an item, complete the checkout, and observe Slack. The simplest approach is to use the Medusa admin (`http://localhost:9000/app`) to manually create a test order via the UI — go to Orders → Create order.

Alternatively, check existing test scripts:

```bash
ls src/scripts/test-*.ts
```

If a test-order script exists, run it:

```bash
npx medusa exec ./src/scripts/test-order.ts
```

- [ ] **Step 5: Verify Slack message appeared**

Open the Slack channel connected to the webhook and confirm the message contains:
- Header: `🛍️ Nueva orden recibida`
- Order number
- Customer name or `(sin nombre)`
- Email or `(sin email)`
- Products list
- Total with currency

- [ ] **Step 6: Test missing env var behavior**

Comment out `SLACK_ORDERS_WEBHOOK_URL` in `.env` and restart the server. Place another test order. Check server logs for:

```
[order-placed-slack] SLACK_ORDERS_WEBHOOK_URL not configured — skipping notification
```

Confirm the order was created successfully despite the missing config.

- [ ] **Step 7: Restore env var**

Uncomment `SLACK_ORDERS_WEBHOOK_URL` in `.env`.

---

## Task 6: Add env var to Railway

This step is performed in the Railway dashboard, not in code.

- [ ] **Step 1: Open Railway project**

Go to the Railway dashboard → Novapatch backend service → Variables.

- [ ] **Step 2: Add the variable**

```
SLACK_ORDERS_WEBHOOK_URL = https://hooks.slack.com/services/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
```

- [ ] **Step 3: Deploy**

Railway redeploys automatically on variable change. Wait for the deployment to complete and verify no errors in the deploy log.

---

## Self-Review Notes

- **CA-01** (order → Slack message): Task 4 + Task 5 step 4-5. ✓
- **CA-02** (message contains RF-03 minimum fields): `mapOrderToSlackBlocks` includes all required fields; null-safe fallbacks for optional ones. ✓
- **CA-03** (webhook failure → logged, order unaffected): subscriber `catch` block in Task 4. ✓
- **CA-04** (missing env var → warning logged): early return in subscriber in Task 4; manual test in Task 5 step 6. ✓
- **CA-05** (null optional fields → no crash): 7 tests covering null cases in Task 1. ✓
- **RF-07** (no blocking of order): subscriber never throws. ✓
- **RNF-03** (webhook URL not in frontend or logs): URL is in `.env` only; subscriber logs order ID but never logs the URL. ✓
