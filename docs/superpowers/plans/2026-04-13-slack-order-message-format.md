# Slack Order Message Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `order.placed` Slack notification with a leaner message sent after the Envia label is generated, showing only order number, date, products with quantities, and a link to the Envia label PDF.

**Architecture:** Add a `notifySlackStep` as the last step of the `envia-create-fulfillment` workflow, which has direct access to both the order and the generated `shipment.label` URL. Replace `mapOrderToSlackBlocks` in `slack-mappers.ts` with a new `mapFulfillmentToSlackBlocks(order, labelUrl)` function. Delete the existing `order-placed-slack.ts` subscriber.

**Tech Stack:** Medusa.js v2 workflow SDK (`createStep`, `StepResponse`), Slack Block Kit, Jest + ts-jest.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/slack-mappers.ts` | Replace `mapOrderToSlackBlocks` with `mapFulfillmentToSlackBlocks(order, labelUrl)` |
| Modify | `src/__tests__/lib/slack-mappers.unit.spec.ts` | Replace all tests for the new function |
| Create | `src/workflows/envia-create-fulfillment/steps/notify-slack.ts` | Workflow step: reads env, calls mapper + client, never throws |
| Modify | `src/workflows/envia-create-fulfillment/index.ts` | Add `notifySlackStep` after `createMedusaFulfillmentStep` |
| Delete | `src/subscribers/order-placed-slack.ts` | Remove old `order.placed` subscriber |

---

## Task 1: Replace mapper function and tests

**Files:**
- Modify: `src/__tests__/lib/slack-mappers.unit.spec.ts`
- Modify: `src/lib/slack-mappers.ts`

- [ ] **Step 1: Write failing tests**

Replace the entire contents of `src/__tests__/lib/slack-mappers.unit.spec.ts` with:

```typescript
import { mapFulfillmentToSlackBlocks } from "../../lib/slack-mappers"

const baseOrder = {
  id: "order_abc123",
  display_id: 1024,
  created_at: "2026-04-13T14:32:00.000Z",
  items: [
    { title: "Energy Patch", quantity: 1, metadata: {} },
    { title: "Sleep Patch", quantity: 2, metadata: {} },
  ],
}

const labelUrl = "https://envia.com/label/abc123.pdf"

describe("mapFulfillmentToSlackBlocks", () => {
  it("returns a non-empty array of blocks", () => {
    const blocks = mapFulfillmentToSlackBlocks(baseOrder, labelUrl)
    expect(Array.isArray(blocks)).toBe(true)
    expect(blocks.length).toBeGreaterThan(0)
  })

  it("header text is '🚚 Orden lista para envío'", () => {
    const blocks = mapFulfillmentToSlackBlocks(baseOrder, labelUrl)
    const header = blocks.find((b) => b.type === "header") as any
    expect(header?.text?.text).toBe("🚚 Orden lista para envío")
  })

  it("includes order display_id", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain("#1024")
  })

  it("falls back to order.id when display_id is null", () => {
    const text = JSON.stringify(
      mapFulfillmentToSlackBlocks({ ...baseOrder, display_id: null }, labelUrl)
    )
    expect(text).toContain("order_abc123")
  })

  it("includes formatted date", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    // Date is formatted — at minimum the year should appear
    expect(text).toContain("2026")
  })

  it("includes all product titles and quantities", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain("Energy Patch")
    expect(text).toContain("x1")
    expect(text).toContain("Sleep Patch")
    expect(text).toContain("x2")
  })

  it("excludes items with metadata.is_shipping", () => {
    const order = {
      ...baseOrder,
      items: [
        { title: "Energy Patch", quantity: 1, metadata: {} },
        { title: "Envío", quantity: 1, metadata: { is_shipping: true } },
      ],
    }
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(order, labelUrl))
    expect(text).toContain("Energy Patch")
    expect(text).not.toContain("Envío")
  })

  it("shows — when items list is empty after filtering", () => {
    const order = { ...baseOrder, items: [] }
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(order, labelUrl))
    expect(text).toContain("—")
  })

  it("handles null items without throwing", () => {
    const order = { ...baseOrder, items: null }
    expect(() => mapFulfillmentToSlackBlocks(order, labelUrl)).not.toThrow()
  })

  it("includes the label URL as a Slack hyperlink", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).toContain(labelUrl)
    expect(text).toContain("Ver etiqueta PDF")
  })

  it("does NOT include customer name, email, location, or total", () => {
    const text = JSON.stringify(mapFulfillmentToSlackBlocks(baseOrder, labelUrl))
    expect(text).not.toContain("Cliente")
    expect(text).not.toContain("Email")
    expect(text).not.toContain("Ubicación")
    expect(text).not.toContain("Total")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dlucca/Projects/Novapatch/novabackend
npx jest src/__tests__/lib/slack-mappers.unit.spec.ts --no-coverage
```

Expected: FAIL — `mapFulfillmentToSlackBlocks` is not exported.

- [ ] **Step 3: Replace `slack-mappers.ts`**

Replace the entire contents of `src/lib/slack-mappers.ts` with:

```typescript
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

export function mapFulfillmentToSlackBlocks(order: any, labelUrl: string): SlackBlock[] {
  const displayId = order.display_id ? `#${order.display_id}` : order.id
  const date = formatDate(order.created_at)

  const items = (order.items ?? []).filter(
    (item: any) => !item.metadata?.is_shipping && !item.is_shipping_cost
  )
  const productsList =
    items.map((item: any) => `• ${item.title} x${item.quantity}`).join("\n") || "—"

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🚚 Orden lista para envío", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Orden*\n${displayId}` },
        { type: "mrkdwn", text: `*Fecha*\n${date}` },
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
      text: { type: "mrkdwn", text: `*Etiqueta*   <${labelUrl}|Ver etiqueta PDF>` },
    },
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/lib/slack-mappers.unit.spec.ts --no-coverage
```

Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slack-mappers.ts src/__tests__/lib/slack-mappers.unit.spec.ts
git commit -m "feat(slack): replace mapOrderToSlackBlocks with mapFulfillmentToSlackBlocks"
```

---

## Task 2: Create `notifySlackStep`

**Files:**
- Create: `src/workflows/envia-create-fulfillment/steps/notify-slack.ts`

- [ ] **Step 1: Create the step file**

Create `src/workflows/envia-create-fulfillment/steps/notify-slack.ts`:

```typescript
// src/workflows/envia-create-fulfillment/steps/notify-slack.ts

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { mapFulfillmentToSlackBlocks } from "../../../lib/slack-mappers"
import { sendSlackNotification } from "../../../lib/slack-client"

export const notifySlackStep = createStep(
  "notify-slack",
  async ({ order, labelUrl }: { order: any; labelUrl: string }, { container }) => {
    const logger = container.resolve("logger")
    const webhookUrl = process.env.SLACK_ORDERS_WEBHOOK_URL

    if (!webhookUrl) {
      logger.warn(
        "[envia-create-fulfillment] SLACK_ORDERS_WEBHOOK_URL not configured — skipping Slack notification"
      )
      return new StepResponse(null)
    }

    try {
      const blocks = mapFulfillmentToSlackBlocks(order, labelUrl)
      await sendSlackNotification(webhookUrl, blocks)
      logger.info(
        `[envia-create-fulfillment] Slack notification sent for order #${order.display_id ?? order.id}`
      )
    } catch (err) {
      logger.error(
        `[envia-create-fulfillment] Slack notification failed for order ${order.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }

    return new StepResponse(null)
  }
)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `notify-slack.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/workflows/envia-create-fulfillment/steps/notify-slack.ts
git commit -m "feat(slack): add notifySlackStep to envia-create-fulfillment workflow"
```

---

## Task 3: Wire step into workflow and delete old subscriber

**Files:**
- Modify: `src/workflows/envia-create-fulfillment/index.ts`
- Delete: `src/subscribers/order-placed-slack.ts`

- [ ] **Step 1: Update the workflow**

Replace the entire contents of `src/workflows/envia-create-fulfillment/index.ts` with:

```typescript
// src/workflows/envia-create-fulfillment/index.ts
//
// Medusa workflow that quotes Envia carriers, generates the cheapest available
// shipping label, registers the fulfillment in Medusa, and sends a Slack notification
// — with automatic compensation: if Medusa fulfillment creation fails, the Envia
// label is cancelled to avoid an untracked charge.
//
// Triggered by: src/subscribers/envia-fulfillment.ts (order.payment_captured)

import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { fetchOrderForFulfillmentStep } from "./steps/fetch-order"
import { generateEnviaLabelStep } from "./steps/generate-label"
import { createMedusaFulfillmentStep } from "./steps/create-fulfillment"
import { notifySlackStep } from "./steps/notify-slack"

type EnviaFulfillmentInput = { orderId: string }

export const enviaCreateFulfillmentWorkflow = createWorkflow(
  "envia-create-fulfillment",
  (input: EnviaFulfillmentInput) => {
    const order = fetchOrderForFulfillmentStep(input)
    const shipment = generateEnviaLabelStep({ order })
    createMedusaFulfillmentStep({ order, shipment })
    notifySlackStep({ order, labelUrl: shipment.label })
    return new WorkflowResponse({ trackingNumber: shipment.trackingNumber })
  }
)
```

- [ ] **Step 2: Delete the old subscriber**

```bash
rm src/subscribers/order-placed-slack.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Run full test suite to confirm nothing is broken**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass. The old `mapOrderToSlackBlocks` tests are gone; the new ones pass.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/envia-create-fulfillment/index.ts
git rm src/subscribers/order-placed-slack.ts
git commit -m "feat(slack): wire notifySlackStep into workflow, remove order.placed subscriber"
```
