# Envia Shipping Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate an Envia.com shipping label when a Novapatch order payment is captured, and receive real-time tracking status updates via webhook.

**Architecture:** Two independent flows — Flujo A triggers on `order.payment_captured`, calls Envia rate (once per carrier from a known list, since the API requires one carrier per request) + generate APIs, and creates a Medusa fulfillment with the tracking number; Flujo B is a public webhook endpoint that receives Envia status updates and updates the fulfillment metadata asynchronously. Both flows share a typed HTTP wrapper (`EnviaClient`) and address-mapping helpers (`envia-mappers`).

> **API Corrections vs PRD (verified against docs.envia.com):**
> - `/ship/rate/` requires `carrier` field — one request per carrier. To compare rates, call rate for each carrier in a known list and pick cheapest.
> - Webhook registration uses `type_id` (integer from `GET /webhook-types`) + `active: 1`, not `events` array.
> - Webhook test: `POST /ship/webhooktest/` with `{ tracking_number, webhook_url }` body.

**Tech Stack:** Medusa.js v2, TypeScript, Node.js `fetch`, `@medusajs/medusa/core-flows`, `@medusajs/framework/utils` (Modules), Jest + SWC for unit tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/config/warehouse.ts` | Create | Novapatch warehouse address constant (origin for all shipments) |
| `src/lib/envia-client.ts` | Create | Typed HTTP wrapper for Envia API (rate, generate) + `withRetry` + exported types |
| `src/lib/envia-mappers.ts` | Create | Pure functions: `mapAddress`, `buildPackages`, `buildShipmentRequest` |
| `src/__tests__/lib/envia-client.unit.spec.ts` | Create | Unit tests for `withRetry` and `isRetryable` |
| `src/__tests__/lib/envia-mappers.unit.spec.ts` | Create | Unit tests for `mapAddress` and `buildPackages` |
| `src/subscribers/envia-fulfillment.ts` | Create | Subscriber for `order.payment_captured` — runs Flujo A |
| `src/api/webhooks/envia/route.ts` | Create | POST endpoint — receives Envia status updates (Flujo B) |
| `src/scripts/register-envia-webhook.ts` | Create | One-time script to register the webhook URL in Envia |

---

## Task 1: Warehouse Config

**Files:**
- Create: `src/config/warehouse.ts`

- [ ] **Step 1: Create the warehouse constant**

```typescript
// src/config/warehouse.ts
import type { EnviaAddress } from "../lib/envia-client"

export const WAREHOUSE: EnviaAddress = {
  name: "Novapatch Bodega",
  phone: process.env.WAREHOUSE_PHONE ?? "+525500000000",
  street: process.env.WAREHOUSE_STREET ?? "Calle Ejemplo 123",
  city: process.env.WAREHOUSE_CITY ?? "Ciudad de México",
  state: process.env.WAREHOUSE_STATE ?? "CMX",
  country: "MX",
  postalCode: process.env.WAREHOUSE_POSTAL_CODE ?? "06600",
}
```

> The address fields are pulled from env vars so ops can update them without a deploy. The defaults are placeholders — set real values in `.env` and Railway before going to production.

- [ ] **Step 2: Add env vars to `.env.example` (or your local `.env`)**

```bash
# Warehouse / origin address for Envia shipments
WAREHOUSE_PHONE=+525500000000
WAREHOUSE_STREET=Calle Ejemplo 123
WAREHOUSE_CITY=Ciudad de México
WAREHOUSE_STATE=CMX
WAREHOUSE_POSTAL_CODE=06600
```

- [ ] **Step 3: Commit**

```bash
git add src/config/warehouse.ts
git commit -m "feat(envia): add warehouse origin address config"
```

---

## Task 2: EnviaClient HTTP Wrapper

**Files:**
- Create: `src/lib/envia-client.ts`
- Create: `src/__tests__/lib/envia-client.unit.spec.ts`

- [ ] **Step 1: Write the failing unit tests first**

```typescript
// src/__tests__/lib/envia-client.unit.spec.ts
import { withRetry, isRetryable } from "../../lib/envia-client"

describe("isRetryable", () => {
  it("returns true for 5xx status codes", () => {
    const err = Object.assign(new Error("server error"), { statusCode: 503 })
    expect(isRetryable(err)).toBe(true)
  })

  it("returns true for timeout errors", () => {
    const err = new Error("Request timeout")
    expect(isRetryable(err)).toBe(true)
  })

  it("returns true for ECONNRESET", () => {
    const err = new Error("ECONNRESET")
    expect(isRetryable(err)).toBe(true)
  })

  it("returns false for 4xx status codes", () => {
    const err = Object.assign(new Error("bad request"), { statusCode: 422 })
    expect(isRetryable(err)).toBe(false)
  })

  it("returns false for non-Error values", () => {
    expect(isRetryable("some string")).toBe(false)
    expect(isRetryable(null)).toBe(false)
  })
})

describe("withRetry", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("returns result on first successful attempt", async () => {
    const fn = jest.fn().mockResolvedValue("ok")
    const result = await withRetry(fn)
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on retryable error and eventually succeeds", async () => {
    const retryableErr = Object.assign(new Error("5xx"), { statusCode: 503 })
    const fn = jest.fn()
      .mockRejectedValueOnce(retryableErr)
      .mockResolvedValue("ok")

    const promise = withRetry(fn, 3)
    // Advance timers to skip exponential backoff
    await jest.runAllTimersAsync()
    const result = await promise
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("does not retry on non-retryable error", async () => {
    const err = Object.assign(new Error("4xx"), { statusCode: 400 })
    const fn = jest.fn().mockRejectedValue(err)

    const promise = withRetry(fn, 3)
    await jest.runAllTimersAsync()
    await expect(promise).rejects.toThrow("4xx")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("throws after exhausting max attempts", async () => {
    const err = Object.assign(new Error("503"), { statusCode: 503 })
    const fn = jest.fn().mockRejectedValue(err)

    const promise = withRetry(fn, 3)
    await jest.runAllTimersAsync()
    await expect(promise).rejects.toThrow("503")
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail (module not found)**

```bash
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/lib/envia-client.unit.spec.ts --no-coverage
```

Expected output: FAIL — `Cannot find module '../../lib/envia-client'`

- [ ] **Step 3: Create the EnviaClient**

```typescript
// src/lib/envia-client.ts

// ─── Shared Address / Package Types ───────────────────────────────────────────

export type EnviaAddress = {
  name: string
  phone: string
  street: string
  city: string
  state: string
  country: string
  postalCode: string
}

export type EnviaPackage = {
  type: "box"
  content: string
  amount: number
  declaredValue: number
  lengthUnit: "CM"
  weightUnit: "KG"
  weight: number
  dimensions: { length: number; width: number; height: number }
}

export type EnviaShipmentRequest = {
  origin: EnviaAddress
  destination: EnviaAddress
  packages: EnviaPackage[]
  shipment: { type: 1; carrier?: string; service?: string }
}

export type EnviaRateResult = {
  carrier: string
  service: string
  serviceDescription: string
  deliveryEstimate: string
  totalPrice: string
  currency: string
}

export type EnviaGenerateResult = {
  carrier: string
  service: string
  shipmentId: number
  trackingNumber: string
  trackUrl: string
  label: string
  totalPrice: number
  currency: string
}

// ─── Retry Utilities ──────────────────────────────────────────────────────────

export function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const statusCode = (err as Error & { statusCode?: number }).statusCode
  if (statusCode !== undefined && statusCode >= 500) return true
  const msg = err.message.toLowerCase()
  return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("etimedout")
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isRetryable(err) || attempt === maxAttempts) throw err
      // Exponential backoff: 1s, 2s, 4s…
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)))
    }
  }
  // Unreachable — TypeScript requires a return
  throw new Error("withRetry: exhausted attempts")
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

export class EnviaClient {
  private readonly apiUrl: string
  private readonly token: string

  constructor() {
    const token = process.env.ENVIA_API_TOKEN
    const apiUrl = process.env.ENVIA_API_URL
    if (!token) throw new Error("ENVIA_API_TOKEN env var is not set")
    if (!apiUrl) throw new Error("ENVIA_API_URL env var is not set")
    this.token = token
    this.apiUrl = apiUrl
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`Envia ${path} ${response.status}: ${text}`) as Error & { statusCode: number }
      err.statusCode = response.status
      throw err
    }
    const json = (await response.json()) as { data: T }
    return json.data
  }

  /**
   * Returns a rate for a single carrier.
   * The Envia API requires one carrier per request — call this once per carrier
   * and compare results to find the cheapest.
   */
  async getRate(req: EnviaShipmentRequest): Promise<EnviaRateResult | null> {
    try {
      const results = await withRetry(() => this.post<EnviaRateResult[]>("/ship/rate/", req))
      return results?.[0] ?? null
    } catch {
      return null
    }
  }

  /** Generates a shipping label using the specified carrier + service. */
  async generateShipment(req: EnviaShipmentRequest): Promise<EnviaGenerateResult> {
    return withRetry(async () => {
      const results = await this.post<EnviaGenerateResult[]>("/ship/generate/", req)
      return results[0]
    })
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/lib/envia-client.unit.spec.ts --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/envia-client.ts src/__tests__/lib/envia-client.unit.spec.ts
git commit -m "feat(envia): add EnviaClient HTTP wrapper with retry logic"
```

---

## Task 3: Envia Mappers

**Files:**
- Create: `src/lib/envia-mappers.ts`
- Create: `src/__tests__/lib/envia-mappers.unit.spec.ts`

- [ ] **Step 1: Write the failing unit tests first**

```typescript
// src/__tests__/lib/envia-mappers.unit.spec.ts
import { mapAddress, buildPackages, buildShipmentRequest } from "../../lib/envia-mappers"

// Stub the warehouse import so tests don't need env vars
jest.mock("../../config/warehouse", () => ({
  WAREHOUSE: {
    name: "Bodega Test",
    phone: "+525500000000",
    street: "Calle Test 1",
    city: "CDMX",
    state: "CMX",
    country: "MX",
    postalCode: "06600",
  },
}))

describe("mapAddress", () => {
  it("maps a full Medusa shipping address to EnviaAddress", () => {
    const result = mapAddress({
      first_name: "Luis",
      last_name: "Pérez",
      phone: "+52 5511111111",
      address_1: "Insurgentes Sur 2000",
      city: "Ciudad de México",
      province: "CMX",
      country_code: "mx",
      postal_code: "03100",
    })
    expect(result).toEqual({
      name: "Luis Pérez",
      phone: "+52 5511111111",
      street: "Insurgentes Sur 2000",
      city: "Ciudad de México",
      state: "CMX",
      country: "MX",
      postalCode: "03100",
    })
  })

  it("defaults name to 'Cliente' when first/last name are missing", () => {
    const result = mapAddress({ country_code: "mx" })
    expect(result.name).toBe("Cliente")
  })

  it("uppercases the country code", () => {
    const result = mapAddress({ country_code: "mx" })
    expect(result.country).toBe("MX")
  })

  it("returns empty strings for missing optional fields", () => {
    const result = mapAddress({})
    expect(result.phone).toBe("")
    expect(result.street).toBe("")
    expect(result.city).toBe("")
    expect(result.state).toBe("")
    expect(result.postalCode).toBe("")
  })
})

describe("buildPackages", () => {
  it("returns a single box package with aggregated quantity", () => {
    const [pkg] = buildPackages([
      { quantity: 2, unit_price: 120000 },
      { quantity: 1, unit_price: 120000 },
    ])
    expect(pkg.amount).toBe(3)
    expect(pkg.type).toBe("box")
  })

  it("calculates declared value as sum of (unit_price * quantity) / 100", () => {
    // 2 × 120000 + 1 × 60000 = 300000 centavos → 3000 MXN
    const [pkg] = buildPackages([
      { quantity: 2, unit_price: 120000 },
      { quantity: 1, unit_price: 60000 },
    ])
    expect(pkg.declaredValue).toBe(3000)
  })

  it("uses fixed dimensions and weight from spec", () => {
    const [pkg] = buildPackages([{ quantity: 1, unit_price: 100000 }])
    expect(pkg.dimensions).toEqual({ length: 20, width: 15, height: 3 })
    expect(pkg.weight).toBe(0.2)
    expect(pkg.lengthUnit).toBe("CM")
    expect(pkg.weightUnit).toBe("KG")
  })

  it("handles a single item with quantity 1", () => {
    const [pkg] = buildPackages([{ quantity: 1, unit_price: 120000 }])
    expect(pkg.amount).toBe(1)
    expect(pkg.declaredValue).toBe(1200)
  })
})

describe("buildShipmentRequest", () => {
  const destination = {
    name: "Ana García",
    phone: "+52 5511111111",
    street: "Av. Reforma 500",
    city: "CDMX",
    state: "CMX",
    country: "MX",
    postalCode: "06600",
  }

  it("sets shipment type to 1 always", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }])
    expect(req.shipment.type).toBe(1)
  })

  it("includes carrier and service when provided", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }], {
      carrier: "dhl",
      service: "ground",
    })
    expect(req.shipment.carrier).toBe("dhl")
    expect(req.shipment.service).toBe("ground")
  })

  it("omits carrier and service when not provided", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }])
    expect(req.shipment.carrier).toBeUndefined()
    expect(req.shipment.service).toBeUndefined()
  })

  it("uses WAREHOUSE as origin", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }])
    expect(req.origin.name).toBe("Bodega Test")
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail (module not found)**

```bash
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/lib/envia-mappers.unit.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../lib/envia-mappers'`

- [ ] **Step 3: Create the mappers**

```typescript
// src/lib/envia-mappers.ts
import { WAREHOUSE } from "../config/warehouse"
import type { EnviaAddress, EnviaPackage, EnviaShipmentRequest } from "./envia-client"

type MedusaAddress = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  address_1?: string | null
  city?: string | null
  province?: string | null
  country_code?: string | null
  postal_code?: string | null
}

type MedusaLineItem = {
  title?: string | null
  quantity?: number | null
  unit_price?: number | null
}

export function mapAddress(medusaAddress: MedusaAddress): EnviaAddress {
  const nameParts = [medusaAddress.first_name, medusaAddress.last_name].filter(Boolean)
  return {
    name: nameParts.length > 0 ? nameParts.join(" ") : "Cliente",
    phone: medusaAddress.phone ?? "",
    street: medusaAddress.address_1 ?? "",
    city: medusaAddress.city ?? "",
    state: medusaAddress.province ?? "",
    country: (medusaAddress.country_code ?? "MX").toUpperCase(),
    postalCode: medusaAddress.postal_code ?? "",
  }
}

export function buildPackages(items: MedusaLineItem[]): EnviaPackage[] {
  const totalQuantity = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0)
  // unit_price is in centavos in Medusa; Envia expects pesos
  const totalValue = items.reduce(
    (sum, item) => sum + ((item.unit_price ?? 0) * (item.quantity ?? 1)) / 100,
    0
  )
  return [
    {
      type: "box",
      content: "Vitamin patches",
      amount: totalQuantity,
      declaredValue: totalValue,
      lengthUnit: "CM",
      weightUnit: "KG",
      weight: 0.2,
      dimensions: { length: 20, width: 15, height: 3 },
    },
  ]
}

export function buildShipmentRequest(
  destination: EnviaAddress,
  items: MedusaLineItem[],
  opts?: { carrier?: string; service?: string }
): EnviaShipmentRequest {
  return {
    origin: WAREHOUSE,
    destination,
    packages: buildPackages(items),
    shipment: {
      type: 1,
      ...(opts?.carrier !== undefined ? { carrier: opts.carrier } : {}),
      ...(opts?.service !== undefined ? { service: opts.service } : {}),
    },
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/lib/envia-mappers.unit.spec.ts --no-coverage
```

Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/envia-mappers.ts src/__tests__/lib/envia-mappers.unit.spec.ts
git commit -m "feat(envia): add address and package mappers with unit tests"
```

---

## Task 4: Fulfillment Subscriber (Flujo A)

Listens to `order.payment_captured`, calls Envia to get rates, picks the cheapest, generates a label, and creates a Medusa fulfillment with the tracking number.

**Files:**
- Create: `src/subscribers/envia-fulfillment.ts`

- [ ] **Step 1: Create the subscriber**

```typescript
// src/subscribers/envia-fulfillment.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { EnviaClient, type EnviaRateResult } from "../lib/envia-client"
import { mapAddress, buildShipmentRequest } from "../lib/envia-mappers"

// Carriers to quote in parallel. The Envia API requires one carrier per request.
// Add/remove from this list based on carriers available in your Envia account.
const CARRIERS_TO_QUOTE = ["dhl", "fedex", "estafeta", "j&t", "99min"]

export default async function enviaFulfillmentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  // Guard: skip if Envia is not configured (e.g. local dev without sandbox token)
  if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
    logger.warn(`[envia-fulfillment] ENVIA_API_TOKEN or ENVIA_API_URL not set — skipping order ${orderId}`)
    return
  }

  try {
    // 1. Fetch the order with shipping address and items
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    }) as any

    if (!order) {
      logger.warn(`[envia-fulfillment] Order ${orderId} not found`)
      return
    }

    if (!order.shipping_address) {
      logger.warn(`[envia-fulfillment] Order ${orderId} has no shipping address — skipping`)
      return
    }

    const destination = mapAddress(order.shipping_address)
    const client = new EnviaClient()

    // 2. Quote each carrier in parallel (API requires one carrier per request)
    const rateResults = await Promise.all(
      CARRIERS_TO_QUOTE.map((carrier) =>
        client.getRate(buildShipmentRequest(destination, order.items ?? [], { carrier }))
      )
    )
    const rates = rateResults.filter((r): r is EnviaRateResult => r !== null)

    if (rates.length === 0) {
      logger.error(`[envia-fulfillment] No rates available for order ${orderId} — fulfillment skipped`)
      // RNF-01: do NOT cancel the order — it stays as `paid` without a fulfillment
      return
    }

    const cheapest = rates.reduce((best, rate) =>
      parseFloat(rate.totalPrice) < parseFloat(best.totalPrice) ? rate : best
    )

    logger.info(
      `[envia-fulfillment] Selected carrier ${cheapest.carrier} / ${cheapest.service} at ${cheapest.totalPrice} ${cheapest.currency} for order ${orderId}`
    )

    // 3. Generate the shipping label with the selected carrier + service
    const generateReq = buildShipmentRequest(destination, order.items ?? [], {
      carrier: cheapest.carrier,
      service: cheapest.service,
    })
    const shipment = await client.generateShipment(generateReq)

    logger.info(
      `[envia-fulfillment] Label generated — trackingNumber: ${shipment.trackingNumber}, shipmentId: ${shipment.shipmentId}`
    )

    // 4. Create a Medusa fulfillment for all items in the order
    const locationId = process.env.MEDUSA_WAREHOUSE_LOCATION_ID
    await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: orderId,
        location_id: locationId ?? "",
        items: (order.items ?? []).map((item: any) => ({
          id: item.id,
          quantity: item.quantity,
        })),
        labels: [
          {
            tracking_number: shipment.trackingNumber,
            tracking_url: shipment.trackUrl,
          },
        ],
        metadata: {
          envia_shipment_id: String(shipment.shipmentId),
          envia_track_url: shipment.trackUrl,
          envia_label_url: shipment.label,
          carrier: shipment.carrier,
          service: shipment.service,
        },
      },
    })

    logger.info(
      `[envia-fulfillment] Fulfillment created for order ${orderId} with tracking ${shipment.trackingNumber}`
    )
  } catch (err) {
    // RNF-01: never throw — let the order stay paid; an operator can create the fulfillment manually
    logger.error(
      `[envia-fulfillment] Failed to create fulfillment for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: {
    subscriberId: "envia-fulfillment",
  },
}
```

- [ ] **Step 2: Add required env vars to your local `.env`**

```bash
# Envia API
ENVIA_API_TOKEN=<token from accounts-sandbox.envia.com>
ENVIA_API_URL=https://api-test.envia.com
ENVIA_QUERIES_URL=https://queries-test.envia.com

# Medusa warehouse stock location ID (get from admin panel or DB)
MEDUSA_WAREHOUSE_LOCATION_ID=<location_id from Medusa>
```

- [ ] **Step 3: Start dev server and verify TypeScript compiles without errors**

```bash
npx medusa develop
```

Expected: Server starts on `:9000` with no TypeScript errors. In the logs you should see the subscriber registered (Medusa logs all subscribers on startup).

- [ ] **Step 4: Commit**

```bash
git add src/subscribers/envia-fulfillment.ts
git commit -m "feat(envia): add fulfillment subscriber for order.payment_captured (Flujo A)"
```

---

## Task 5: Webhook Endpoint (Flujo B)

Receives tracking status updates from Envia. Responds `200` immediately, processes asynchronously, and deduplicates events using an in-memory hash set.

**Files:**
- Create: `src/api/webhooks/envia/route.ts`

- [ ] **Step 1: Create the webhook route**

```typescript
// src/api/webhooks/envia/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import crypto from "node:crypto"

// In-memory deduplication store: hash → expires-at timestamp
// Entries are kept for 24h to survive brief restarts of the same event
const processed = new Map<string, number>()
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000

function eventHash(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
}

function isDuplicate(hash: string): boolean {
  const expiresAt = processed.get(hash)
  if (expiresAt === undefined) return false
  if (Date.now() > expiresAt) {
    processed.delete(hash)
    return false
  }
  return true
}

type EnviaWebhookPayload = {
  trackingNumber: string
  status: "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returned"
  carrierName?: string
  events?: Array<{ timestamp: string; description: string; location?: string }>
}

async function processEvent(
  payload: EnviaWebhookPayload,
  container: any
): Promise<void> {
  const logger = container.resolve("logger")
  const { trackingNumber, status } = payload

  logger.info(`[envia-webhook] trackingNumber=${trackingNumber} status=${status}`)

  try {
    // Find the fulfillment label by tracking number
    const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
    const labels = await fulfillmentModule.listFulfillmentLabels({ tracking_number: trackingNumber })

    if (!labels || labels.length === 0) {
      logger.warn(`[envia-webhook] No fulfillment found for tracking ${trackingNumber}`)
      return
    }

    const fulfillmentId = labels[0].fulfillment_id
    const fulfillment = await fulfillmentModule.retrieveFulfillment(fulfillmentId)

    // Update fulfillment metadata with the latest status
    await fulfillmentModule.updateFulfillment(fulfillmentId, {
      metadata: {
        ...(fulfillment.metadata ?? {}),
        envia_last_status: status,
        envia_last_event_at: new Date().toISOString(),
      },
    })

    logger.info(`[envia-webhook] Updated fulfillment ${fulfillmentId} status → ${status}`)

    // Trigger downstream events
    const eventBus = container.resolve(Modules.EVENT_BUS)

    if (status === "delivered") {
      // Could fire a "order.delivered" event or send a delivery confirmation email here
      // For Phase 1 the Envia-branded tracking page handles customer notifications
      logger.info(`[envia-webhook] Order delivered — tracking ${trackingNumber}`)
    } else if (status === "failed" || status === "returned") {
      // Surface in logs for manual operator review
      logger.warn(
        `[envia-webhook] Shipment issue (${status}) for tracking ${trackingNumber} — manual review required`
      )
    }
  } catch (err) {
    const logger2 = container.resolve("logger")
    logger2.error(
      `[envia-webhook] Error processing event for ${trackingNumber}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Respond 200 immediately — Envia requires < 5s (RNF-03)
  res.status(200).json({ received: true })

  const payload = req.body as EnviaWebhookPayload

  if (!payload?.trackingNumber) return

  // Idempotency: skip duplicate events (RNF-04)
  const hash = eventHash(payload)
  if (isDuplicate(hash)) {
    const logger = (req as any).scope?.resolve?.("logger") ?? console
    logger.info?.(`[envia-webhook] Duplicate event skipped — hash ${hash.slice(0, 8)}`)
    return
  }
  processed.set(hash, Date.now() + DEDUP_TTL_MS)

  // Process asynchronously so the response is never blocked (RNF-03)
  setImmediate(() => processEvent(payload, (req as any).scope))
}
```

- [ ] **Step 2: Restart dev server and confirm the route is registered**

```bash
npx medusa develop
```

Then in another terminal:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9000/webhooks/envia \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"TEST123","status":"in_transit"}'
```

Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add src/api/webhooks/envia/route.ts
git commit -m "feat(envia): add webhook endpoint for Envia tracking updates (Flujo B)"
```

---

## Task 6: Register-Webhook Script

A one-time script to register the Novapatch webhook URL in Envia's system. Run once per environment.

**Files:**
- Create: `src/scripts/register-envia-webhook.ts`

- [ ] **Step 1: Create the script**

```typescript
// src/scripts/register-envia-webhook.ts
// Usage: WEBHOOK_URL=https://your-backend.railway.app/webhooks/envia npx medusa exec ./src/scripts/register-envia-webhook.ts

export default async function registerEnviaWebhook() {
  const queriesUrl = process.env.ENVIA_QUERIES_URL
  const token = process.env.ENVIA_API_TOKEN
  const webhookUrl = process.env.WEBHOOK_URL

  if (!queriesUrl) throw new Error("ENVIA_QUERIES_URL env var is not set")
  if (!token) throw new Error("ENVIA_API_TOKEN env var is not set")
  if (!webhookUrl) throw new Error("WEBHOOK_URL env var is not set (e.g. https://your-backend.railway.app/webhooks/envia)")

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  // Step 1: Discover available webhook type IDs
  console.log("Fetching available webhook types...")
  const typesRes = await fetch(`${queriesUrl}/webhook-types`, { headers })
  const typesBody = (await typesRes.json()) as { data: Array<{ id: number; name: string; description: string }> }
  console.log("Available types:", JSON.stringify(typesBody.data, null, 2))

  // Pick the tracking event type — inspect the list above and set the correct ID.
  // Typically the tracking update event has a name containing "track".
  const trackingType = typesBody.data?.find(
    (t) => t.name?.toLowerCase().includes("track") || t.description?.toLowerCase().includes("track")
  )
  if (!trackingType) {
    console.error("Could not auto-detect tracking webhook type. Set TYPE_ID env var manually.")
    console.error("Available types:", typesBody.data)
    process.exit(1)
  }

  const typeId = process.env.ENVIA_WEBHOOK_TYPE_ID
    ? parseInt(process.env.ENVIA_WEBHOOK_TYPE_ID, 10)
    : trackingType.id

  console.log(`Using webhook type_id=${typeId} (${trackingType.name})`)
  console.log(`Registering URL: ${webhookUrl}`)

  // Step 2: Register the webhook
  const regRes = await fetch(`${queriesUrl}/webhooks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type_id: typeId,
      url: webhookUrl,
      active: 1,
    }),
  })

  const regBody = await regRes.json()

  if (!regRes.ok) {
    console.error("Failed to register webhook:", regBody)
    process.exit(1)
  }

  console.log("Webhook registered successfully!")
  console.log("Response:", JSON.stringify(regBody, null, 2))
  console.log("")
  console.log("Save the webhook ID to your env vars:")
  console.log(`  ENVIA_WEBHOOK_ID=${(regBody as any).data?.id ?? "<id from response>"}`)
}
```

- [ ] **Step 2: Register the webhook in Envia sandbox**

First, expose your local server via ngrok (required for Envia to reach you):
```bash
npx ngrok http 9000
# Copy the generated URL, e.g. https://abc123.ngrok.io
```

Then run the script:
```bash
WEBHOOK_URL=https://abc123.ngrok.io/webhooks/envia npx medusa exec ./src/scripts/register-envia-webhook.ts
```

Expected: Response with a webhook ID. Copy it to your `.env`:
```bash
ENVIA_WEBHOOK_ID=<id from response>
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/register-envia-webhook.ts
git commit -m "feat(envia): add one-time webhook registration script"
```

---

## Task 7: End-to-End Sandbox Testing

Manual verification — no automated tests for the full E2E flow (requires live Envia credentials).

- [ ] **T-01 — Rate check**

```bash
curl -s -X POST https://api-test.envia.com/ship/rate/ \
  -H "Authorization: Bearer $ENVIA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": { "name":"Novapatch Bodega","phone":"+525500000000","street":"Calle Ejemplo 123","city":"Ciudad de México","state":"CMX","country":"MX","postalCode":"06600" },
    "destination": { "name":"Luis Pérez","phone":"+52 5511111111","street":"Insurgentes Sur 2000","city":"Ciudad de México","state":"CMX","country":"MX","postalCode":"03100" },
    "packages": [{ "type":"box","content":"Vitamin patches","amount":1,"declaredValue":1200,"lengthUnit":"CM","weightUnit":"KG","weight":0.2,"dimensions":{"length":20,"width":15,"height":3} }],
    "shipment": { "type": 1 }
  }' | jq '.data[0]'
```

Expected: Object with `carrier`, `service`, `totalPrice` in MXN.

- [ ] **T-02 — Generate label**

Same body as T-01 but add `"carrier": "<carrier>"` and `"service": "<service>"` to the `shipment` object (use values from T-01 response). Call `POST https://api-test.envia.com/ship/generate/` instead.

Expected: Response with `trackingNumber`, `trackUrl`, `label`.

- [ ] **T-03 — Full subscriber flow**

1. Create an order in Medusa with a valid MX shipping address
2. Capture the payment via the Medusa admin
3. Check logs: should see `[envia-fulfillment] Label generated` and `[envia-fulfillment] Fulfillment created`
4. Check the order in Medusa admin: fulfillment should appear with the tracking number

- [ ] **T-04 — Webhook reception**

Use the Envia test endpoint to fire a sample webhook to your local server (via ngrok):

```bash
curl -s -X POST https://api-test.envia.com/ship/webhooktest/ \
  -H "Authorization: Bearer $ENVIA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tracking_number": "<trackingNumber from T-02>",
    "webhook_url": "https://<your-ngrok-id>.ngrok.io/webhooks/envia"
  }'
```

Expected: `[envia-webhook] trackingNumber=... status=...` appears in the dev server logs within a few seconds.

- [ ] **T-05 — Failure handling (invalid address)**

Create an order with a non-existent postal code. Capture payment.

Expected: Logs show `[envia-fulfillment] No rates available... — fulfillment skipped`. Order remains in `paid` status. No crash.

- [ ] **Step: Final commit and push**

```bash
git push -u origin feat/envia-shipping-integration
```

---

## Environment Variables Summary

Add all of these to `.env` (development) and Railway (production):

| Variable | Sandbox | Production |
|----------|---------|-----------|
| `ENVIA_API_TOKEN` | Token from `accounts-sandbox.envia.com` | Token from `accounts.envia.com` |
| `ENVIA_API_URL` | `https://api-test.envia.com` | `https://api.envia.com` |
| `ENVIA_QUERIES_URL` | `https://queries-test.envia.com` | `https://queries.envia.com` |
| `ENVIA_WEBHOOK_ID` | ID from sandbox registration | ID from prod registration |
| `MEDUSA_WAREHOUSE_LOCATION_ID` | Location ID from Medusa DB | Same |
| `WAREHOUSE_PHONE` | Your warehouse phone | Same |
| `WAREHOUSE_STREET` | Warehouse street address | Same |
| `WAREHOUSE_CITY` | Warehouse city | Same |
| `WAREHOUSE_STATE` | State code (e.g. `CMX`) | Same |
| `WAREHOUSE_POSTAL_CODE` | Warehouse ZIP | Same |
