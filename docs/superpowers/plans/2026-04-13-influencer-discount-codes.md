# Influencer Discount Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each influencer to have a unique percentage-based discount code with an expiration date, managed and monitored from a dedicated admin page at `/a/influencers`.

**Architecture:** Uses Medusa v2's built-in Promotions module (already active in core — no new modules or migrations needed). Each influencer maps to one `Promotion` (code + percentage) linked to one `Campaign` (date range). A custom admin route renders a table of influencer codes with usage and revenue metrics, and a modal to create new codes. Revenue is computed by querying orders client-side and filtering by promotion code.

**Tech Stack:** Medusa v2 (Promotions module, Admin SDK), React 18, `@medusajs/ui`, `@medusajs/icons`, native `fetch` with `credentials: "include"`, Jest + SWC for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/admin/routes/influencers/page.tsx` | Main admin page — `defineRouteConfig` + layout |
| Create | `src/admin/routes/influencers/lib/metrics.ts` | `computeRevenue(orders)` utility |
| Create | `src/admin/routes/influencers/components/influencer-table.tsx` | Fetches + renders influencer promotion list |
| Create | `src/admin/routes/influencers/components/new-influencer-modal.tsx` | Form to create Promotion + Campaign |
| Create | `src/admin/routes/influencers/components/influencer-detail-drawer.tsx` | Order list per influencer code |
| Create | `src/__tests__/admin/influencer-metrics.unit.spec.ts` | Unit tests for metrics utility |

---

## Task 1: Metrics utility + unit test

**Files:**
- Create: `src/admin/routes/influencers/lib/metrics.ts`
- Create: `src/__tests__/admin/influencer-metrics.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/admin/influencer-metrics.unit.spec.ts`:

```typescript
import { computeRevenue } from "../../../src/admin/routes/influencers/lib/metrics"

type OrderStub = { total: number; currency_code: string }

describe("computeRevenue", () => {
  it("returns 0 for empty order list", () => {
    expect(computeRevenue([])).toBe(0)
  })

  it("sums totals from multiple orders", () => {
    const orders: OrderStub[] = [
      { total: 50000, currency_code: "mxn" },
      { total: 30000, currency_code: "mxn" },
    ]
    expect(computeRevenue(orders)).toBe(80000)
  })

  it("handles a single order", () => {
    expect(computeRevenue([{ total: 12345, currency_code: "mxn" }])).toBe(12345)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- --testPathPattern="influencer-metrics"
```

Expected: FAIL — `Cannot find module '../../../src/admin/routes/influencers/lib/metrics'`

- [ ] **Step 3: Create the metrics utility**

Create `src/admin/routes/influencers/lib/metrics.ts`:

```typescript
type OrderWithTotal = { total: number; currency_code: string }

/**
 * Sums order totals (in smallest currency unit, e.g. centavos).
 * All orders are assumed to be in the same currency.
 */
export function computeRevenue(orders: OrderWithTotal[]): number {
  return orders.reduce((sum, o) => sum + (o.total ?? 0), 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- --testPathPattern="influencer-metrics"
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/admin/routes/influencers/lib/metrics.ts src/__tests__/admin/influencer-metrics.unit.spec.ts
git commit -m "feat(influencers): add computeRevenue utility with unit tests"
```

---

## Task 2: Influencer table component

**Files:**
- Create: `src/admin/routes/influencers/components/influencer-table.tsx`

This component fetches all promotions from the Medusa admin API, filters those with `metadata.type === "influencer"`, and renders a table. Revenue per code is fetched separately by querying all orders and filtering client-side.

- [ ] **Step 1: Create the component**

Create `src/admin/routes/influencers/components/influencer-table.tsx`:

```typescript
import { useEffect, useState } from "react"
import { Table, Badge, Button, Text, Heading } from "@medusajs/ui"
import { computeRevenue } from "../lib/metrics"

type InfluencerPromotion = {
  id: string
  code: string
  status: string
  usage_count: number
  metadata: Record<string, string> | null
  campaigns: Array<{
    id: string
    name: string
    starts_at: string | null
    ends_at: string | null
  }>
  application_method: {
    value: number
  } | null
}

type Props = {
  onNew: () => void
  onSelect: (promo: InfluencerPromotion) => void
  refreshKey: number
}

export function InfluencerTable({ onNew, onSelect, refreshKey }: Props) {
  const [promotions, setPromotions] = useState<InfluencerPromotion[]>([])
  const [revenueMap, setRevenueMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Fetch promotions with campaigns and application_method
        const res = await fetch(
          "/admin/promotions?fields=id,code,status,usage_count,metadata,*campaigns,*application_method&limit=200",
          { credentials: "include" }
        )
        if (!res.ok) return
        const json = await res.json()
        const all: InfluencerPromotion[] = json.promotions ?? []
        const influencers = all.filter(
          (p) => p.metadata?.type === "influencer"
        )
        setPromotions(influencers)

        // Fetch revenue: get orders with promotions and sum by code
        if (influencers.length > 0) {
          const ordersRes = await fetch(
            "/admin/orders?fields=id,total,currency_code,*promotions&limit=500",
            { credentials: "include" }
          )
          if (ordersRes.ok) {
            const ordersJson = await ordersRes.json()
            const orders: Array<{
              total: number
              currency_code: string
              promotions?: Array<{ code: string }>
            }> = ordersJson.orders ?? []

            const map: Record<string, number> = {}
            for (const influencer of influencers) {
              const matching = orders.filter((o) =>
                o.promotions?.some((p) => p.code === influencer.code)
              )
              map[influencer.id] = computeRevenue(matching)
            }
            setRevenueMap(map)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshKey])

  if (loading) {
    return (
      <div className="px-6 py-8 text-center">
        <Text className="text-ui-fg-muted">Cargando...</Text>
      </div>
    )
  }

  if (promotions.length === 0) {
    return (
      <div className="px-6 py-12 flex flex-col items-center gap-4">
        <Text className="text-ui-fg-muted">
          No hay códigos de influencer todavía.
        </Text>
        <Button onClick={onNew} size="small">
          Crear primer código
        </Button>
      </div>
    )
  }

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Influencer</Table.HeaderCell>
          <Table.HeaderCell>Handle</Table.HeaderCell>
          <Table.HeaderCell>Código</Table.HeaderCell>
          <Table.HeaderCell>Descuento</Table.HeaderCell>
          <Table.HeaderCell>Vence</Table.HeaderCell>
          <Table.HeaderCell>Usos</Table.HeaderCell>
          <Table.HeaderCell>Revenue</Table.HeaderCell>
          <Table.HeaderCell></Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {promotions.map((promo) => {
          const campaign = promo.campaigns?.[0]
          const endsAt = campaign?.ends_at
            ? new Date(campaign.ends_at).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—"
          const isExpired =
            campaign?.ends_at && new Date(campaign.ends_at) < new Date()
          const revenue = revenueMap[promo.id] ?? 0
          const revenueFormatted = new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
          }).format(revenue / 100)

          return (
            <Table.Row key={promo.id}>
              <Table.Cell>
                <Text size="small" weight="plus">
                  {promo.metadata?.influencer_name ?? "—"}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="small" className="text-ui-fg-muted">
                  {promo.metadata?.handle ?? "—"}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <span className="font-mono text-sm font-medium">{promo.code}</span>
              </Table.Cell>
              <Table.Cell>
                <Text size="small">
                  {promo.application_method?.value ?? "?"}%
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Badge color={isExpired ? "red" : "green"} size="small">
                  {endsAt}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Text size="small">{promo.usage_count ?? 0}</Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="small">{revenueFormatted}</Text>
              </Table.Cell>
              <Table.Cell>
                <Button
                  variant="transparent"
                  size="small"
                  onClick={() => onSelect(promo)}
                >
                  Ver órdenes
                </Button>
              </Table.Cell>
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/routes/influencers/components/influencer-table.tsx
git commit -m "feat(influencers): add InfluencerTable component"
```

---

## Task 3: New influencer modal

**Files:**
- Create: `src/admin/routes/influencers/components/new-influencer-modal.tsx`

Creates a `Promotion` then a `Campaign` linked to it via two sequential admin API calls.

- [ ] **Step 1: Create the component**

Create `src/admin/routes/influencers/components/new-influencer-modal.tsx`:

```typescript
import { useState } from "react"
import {
  FocusModal,
  Button,
  Input,
  Label,
  toast,
  Heading,
  Text,
} from "@medusajs/ui"

type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewInfluencerModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    influencer_name: "",
    handle: "",
    code: "",
    value: "10",
    ends_at: "",
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!form.influencer_name || !form.code || !form.value || !form.ends_at) {
      toast.error("Completa todos los campos obligatorios")
      return
    }

    const code = form.code.toUpperCase().trim()
    const discountValue = parseFloat(form.value)
    if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
      toast.error("El descuento debe ser entre 1 y 100")
      return
    }

    setSaving(true)
    try {
      // Step 1: Create the promotion
      const promoRes = await fetch("/admin/promotions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          type: "standard",
          is_automatic: false,
          application_method: {
            type: "percentage",
            target_type: "order",
            value: discountValue,
            allocation: "each",
          },
          metadata: {
            type: "influencer",
            influencer_name: form.influencer_name.trim(),
            handle: form.handle.trim(),
          },
        }),
      })

      if (!promoRes.ok) {
        const err = await promoRes.json().catch(() => ({}))
        toast.error(err?.message ?? "Error al crear la promoción")
        return
      }

      const { promotion } = await promoRes.json()

      // Step 2: Create the campaign and link the promotion
      const campaignRes = await fetch("/admin/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Influencer ${code}`,
          campaign_identifier: `influencer-${code.toLowerCase()}`,
          starts_at: new Date().toISOString(),
          ends_at: new Date(form.ends_at + "T23:59:59").toISOString(),
          promotions: [{ id: promotion.id }],
        }),
      })

      if (!campaignRes.ok) {
        const err = await campaignRes.json().catch(() => ({}))
        toast.error(err?.message ?? "Error al crear la campaña")
        return
      }

      toast.success(`Código ${code} creado exitosamente`)
      setForm({ influencer_name: "", handle: "", code: "", value: "10", ends_at: "" })
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <FocusModal open={open} onOpenChange={(v) => !v && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <Button onClick={onClose} variant="secondary" size="small">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} size="small" isLoading={saving}>
            Crear código
          </Button>
        </FocusModal.Header>

        <FocusModal.Body className="flex flex-col items-center py-16">
          <div className="w-full max-w-lg flex flex-col gap-6">
            <div>
              <Heading>Nuevo código de influencer</Heading>
              <Text className="text-ui-fg-muted mt-1">
                El código se convierte automáticamente a mayúsculas.
              </Text>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="influencer_name">Nombre del influencer *</Label>
              <Input
                id="influencer_name"
                placeholder="Gaby Ramírez"
                value={form.influencer_name}
                onChange={(e) => handleChange("influencer_name", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="handle">Handle / red social</Label>
              <Input
                id="handle"
                placeholder="@gabyfit"
                value={form.handle}
                onChange={(e) => handleChange("handle", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="code">Código de descuento *</Label>
              <Input
                id="code"
                placeholder="GABY20"
                value={form.code}
                onChange={(e) =>
                  handleChange("code", e.target.value.toUpperCase())
                }
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="value">Porcentaje de descuento (%) *</Label>
              <Input
                id="value"
                type="number"
                min="1"
                max="100"
                placeholder="20"
                value={form.value}
                onChange={(e) => handleChange("value", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="ends_at">Fecha de expiración *</Label>
              <Input
                id="ends_at"
                type="date"
                value={form.ends_at}
                onChange={(e) => handleChange("ends_at", e.target.value)}
              />
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/routes/influencers/components/new-influencer-modal.tsx
git commit -m "feat(influencers): add NewInfluencerModal component"
```

---

## Task 4: Influencer detail drawer

**Files:**
- Create: `src/admin/routes/influencers/components/influencer-detail-drawer.tsx`

Shows a list of orders that used this promotion code, plus a summary of usage and revenue.

- [ ] **Step 1: Create the component**

Create `src/admin/routes/influencers/components/influencer-detail-drawer.tsx`:

```typescript
import { useEffect, useState } from "react"
import { Drawer, Heading, Text, Badge, Button } from "@medusajs/ui"
import { computeRevenue } from "../lib/metrics"

type Order = {
  id: string
  display_id: number
  total: number
  currency_code: string
  created_at: string
  promotions?: Array<{ code: string }>
}

type InfluencerPromotion = {
  id: string
  code: string
  usage_count: number
  metadata: Record<string, string> | null
  application_method: { value: number } | null
  campaigns: Array<{ ends_at: string | null }>
}

type Props = {
  promotion: InfluencerPromotion | null
  onClose: () => void
}

export function InfluencerDetailDrawer({ promotion, onClose }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!promotion) return
    setLoading(true)
    const load = async () => {
      try {
        const res = await fetch(
          "/admin/orders?fields=id,display_id,total,currency_code,created_at,*promotions&limit=500",
          { credentials: "include" }
        )
        if (!res.ok) return
        const json = await res.json()
        const all: Order[] = json.orders ?? []
        const matching = all.filter((o) =>
          o.promotions?.some((p) => p.code === promotion.code)
        )
        setOrders(matching)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [promotion?.id])

  const revenue = computeRevenue(orders)
  const revenueFormatted = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(revenue / 100)

  return (
    <Drawer open={!!promotion} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>
            {promotion?.metadata?.influencer_name ?? promotion?.code}
          </Drawer.Title>
        </Drawer.Header>

        <Drawer.Body className="flex flex-col gap-6 p-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-ui-bg-subtle rounded-lg p-4">
              <Text size="xsmall" className="text-ui-fg-muted mb-1">
                Código
              </Text>
              <Text weight="plus" className="font-mono">
                {promotion?.code}
              </Text>
            </div>
            <div className="bg-ui-bg-subtle rounded-lg p-4">
              <Text size="xsmall" className="text-ui-fg-muted mb-1">
                Descuento
              </Text>
              <Text weight="plus">
                {promotion?.application_method?.value ?? "?"}%
              </Text>
            </div>
            <div className="bg-ui-bg-subtle rounded-lg p-4">
              <Text size="xsmall" className="text-ui-fg-muted mb-1">
                Revenue total
              </Text>
              <Text weight="plus">{revenueFormatted}</Text>
            </div>
          </div>

          {/* Order list */}
          <div>
            <Heading level="h3" className="mb-3">
              Órdenes ({orders.length})
            </Heading>

            {loading && (
              <Text className="text-ui-fg-muted">Cargando órdenes...</Text>
            )}

            {!loading && orders.length === 0 && (
              <Text className="text-ui-fg-muted">
                Aún no hay órdenes con este código.
              </Text>
            )}

            {!loading && orders.length > 0 && (
              <div className="flex flex-col gap-2">
                {orders.map((order) => {
                  const total = new Intl.NumberFormat("es-MX", {
                    style: "currency",
                    currency: order.currency_code?.toUpperCase() ?? "MXN",
                  }).format(order.total / 100)

                  const date = new Date(order.created_at).toLocaleDateString(
                    "es-MX",
                    { day: "numeric", month: "short", year: "numeric" }
                  )

                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between bg-ui-bg-subtle rounded-lg px-4 py-3"
                    >
                      <div>
                        <Text size="small" weight="plus">
                          #{order.display_id}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {date}
                        </Text>
                      </div>
                      <Text size="small" weight="plus">
                        {total}
                      </Text>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Drawer.Body>

        <Drawer.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/routes/influencers/components/influencer-detail-drawer.tsx
git commit -m "feat(influencers): add InfluencerDetailDrawer component"
```

---

## Task 5: Main admin page

**Files:**
- Create: `src/admin/routes/influencers/page.tsx`

Wires all components together and registers the route in the admin sidebar with `defineRouteConfig`.

- [ ] **Step 1: Create the page**

Create `src/admin/routes/influencers/page.tsx`:

```typescript
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { MagnifyingGlass } from "@medusajs/icons"
import { Container, Heading, Button } from "@medusajs/ui"
import { useState } from "react"
import { InfluencerTable } from "./components/influencer-table"
import { NewInfluencerModal } from "./components/new-influencer-modal"
import { InfluencerDetailDrawer } from "./components/influencer-detail-drawer"

type InfluencerPromotion = {
  id: string
  code: string
  status: string
  usage_count: number
  metadata: Record<string, string> | null
  campaigns: Array<{
    id: string
    name: string
    starts_at: string | null
    ends_at: string | null
  }>
  application_method: { value: number } | null
}

const InfluencersPage = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPromo, setSelectedPromo] = useState<InfluencerPromotion | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleCreated = () => setRefreshKey((k) => k + 1)

  return (
    <div className="flex flex-col gap-4 p-8">
      <Container className="divide-y p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h1">Influencers</Heading>
          <Button size="small" onClick={() => setModalOpen(true)}>
            Nuevo código
          </Button>
        </div>

        {/* Table */}
        <InfluencerTable
          onNew={() => setModalOpen(true)}
          onSelect={(promo) => setSelectedPromo(promo)}
          refreshKey={refreshKey}
        />
      </Container>

      {/* Create modal */}
      <NewInfluencerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Detail drawer */}
      <InfluencerDetailDrawer
        promotion={selectedPromo}
        onClose={() => setSelectedPromo(null)}
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Influencers",
  icon: MagnifyingGlass,
})

export default InfluencersPage
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/routes/influencers/page.tsx
git commit -m "feat(influencers): add /a/influencers admin route"
```

---

## Task 6: Smoke test manual

- [ ] **Step 1: Start the dev server**

```bash
npx medusa develop
```

Expected: server starts on `:9000`, admin on `:9000/app`.

- [ ] **Step 2: Verify the admin route appears**

Open `http://localhost:9000/app` → log in → check that "Influencers" appears in the left sidebar.

- [ ] **Step 3: Create a test influencer code**

Click "Nuevo código" → fill in:
- Nombre: `Test Influencer`
- Handle: `@test`
- Código: `TEST10`
- Descuento: `10`
- Fecha de expiración: any future date

Click "Crear código" → toast success → code appears in table.

- [ ] **Step 4: Test code in checkout**

Using any REST client (curl, Postman, or the frontend):

```bash
# 1. Create a cart
curl -X POST http://localhost:9000/store/carts \
  -H "Content-Type: application/json" \
  -d '{"region_id": "<your-region-id>"}'

# 2. Add a line item
curl -X POST http://localhost:9000/store/carts/<cart-id>/line-items \
  -H "Content-Type: application/json" \
  -d '{"variant_id": "<variant-id>", "quantity": 1}'

# 3. Apply the promotion code
curl -X POST http://localhost:9000/store/carts/<cart-id>/promotions \
  -H "Content-Type: application/json" \
  -d '{"promo_codes": ["TEST10"]}'
```

Expected: 200 response, cart subtotal reduced by 10%.

- [ ] **Step 5: Verify usage count updates**

After applying the code to a cart, check in `/a/influencers` that the "Usos" column for `TEST10` incremented.

> **Note on usage_count:** Medusa increments `usage_count` when the promotion is applied to a completed order, not just a cart. Create and complete a test order to see the full counter update.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(influencers): complete influencer discount codes feature"
```

---

## Notes for implementors

**Medusa Promotions endpoint fields:** The `fields` query param uses `*` prefix for relations (e.g., `*campaigns`, `*application_method`). If a field is missing from the response, check the Medusa v2 docs for the exact field selector syntax for that version (2.13.x).

**Revenue calculation scalability:** The current approach fetches up to 500 orders and filters client-side. This is acceptable for early-stage (hundreds of orders). When order volume grows, replace with a server-side aggregation endpoint or Medusa query filtering by promotion ID.

**Expired promotions:** Medusa automatically rejects expired codes at cart application time. The UI shows expired codes in red for awareness but no manual action is needed to deactivate them.
