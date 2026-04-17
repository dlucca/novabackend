// src/admin/widgets/customer-subscriptions.tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge, Table } from "@medusajs/ui"

// ─── Types ────────────────────────────────────────────────────────────────────

type SubscriptionRow = {
  id: string
  status: "active" | "paused" | "canceled" | "past_due" | "delayed_out_of_stock"
  interval_days: 30 | 60 | 90
  next_billing_date: string
  variant: {
    id: string | null
    title: string | null
    product: { title: string | null }
  }
  cycles_count: number
  total_charged: number | null
  currency_code: string | null
}

type CustomerSubscriptionsWidgetProps = {
  data: { id: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  SubscriptionRow["status"],
  { label: string; color: "green" | "orange" | "red" | "purple" }
> = {
  active: { label: "Activa", color: "green" },
  paused: { label: "Pausada", color: "orange" },
  canceled: { label: "Cancelada", color: "red" },
  past_due: { label: "Vencida", color: "red" },
  delayed_out_of_stock: { label: "Sin stock", color: "purple" },
}

const FREQUENCY_LABEL: Record<SubscriptionRow["interval_days"], string> = {
  30: "30 días",
  60: "60 días",
  90: "90 días",
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatAmount(amount: number, currency: string | null): string {
  const safeCurrency =
    currency && currency !== "MIXED" ? currency : "MXN"
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

// ─── Widget ───────────────────────────────────────────────────────────────────

const CustomerSubscriptionsWidget = ({
  data: customer,
}: CustomerSubscriptionsWidgetProps) => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        const res = await fetch(
          `/admin/customers/${customer.id}/subscriptions`,
          { credentials: "include" }
        )
        if (!res.ok) {
          setError(true)
          return
        }
        const json = await res.json()
        setSubscriptions(json.subscriptions ?? [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchSubscriptions()
  }, [customer.id])

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Suscripciones</Heading>
      </div>

      <div className="px-6 py-4">
        {loading && (
          <Text size="small" className="text-ui-fg-muted">
            Cargando suscripciones…
          </Text>
        )}

        {!loading && error && (
          <Text size="small" className="text-ui-fg-error">
            No se pudieron cargar las suscripciones.
          </Text>
        )}

        {!loading && !error && subscriptions.length === 0 && (
          <Text size="small" className="text-ui-fg-muted">
            Este cliente no tiene suscripciones.
          </Text>
        )}

        {!loading && !error && subscriptions.length > 0 && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Producto</Table.HeaderCell>
                <Table.HeaderCell>Estado</Table.HeaderCell>
                <Table.HeaderCell>Frecuencia</Table.HeaderCell>
                <Table.HeaderCell>Próximo cobro</Table.HeaderCell>
                <Table.HeaderCell>Ciclos</Table.HeaderCell>
                <Table.HeaderCell>Total cobrado</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {subscriptions.map((sub) => {
                const badge = STATUS_BADGE[sub.status] ?? {
                  label: sub.status,
                  color: "orange" as const,
                }
                return (
                  <Table.Row key={sub.id}>
                    <Table.Cell>
                      {sub.variant.product.title ?? "—"}
                      {sub.variant.title ? ` — ${sub.variant.title}` : ""}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {FREQUENCY_LABEL[sub.interval_days] ?? `${sub.interval_days} días`}
                    </Table.Cell>
                    <Table.Cell>
                      {sub.next_billing_date
                        ? formatDate(sub.next_billing_date)
                        : "—"}
                    </Table.Cell>
                    <Table.Cell>{sub.cycles_count}</Table.Cell>
                    <Table.Cell>
                      {sub.total_charged != null
                        ? formatAmount(sub.total_charged, sub.currency_code ?? "MXN")
                        : "—"}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.after",
})

export default CustomerSubscriptionsWidget
