import { useEffect, useState } from "react"
import { Drawer, Heading, Text, Button } from "@medusajs/ui"
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
    // MX-only: update when multi-currency regions go live
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
