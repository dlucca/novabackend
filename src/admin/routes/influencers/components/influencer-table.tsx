import { useEffect, useState } from "react"
import { Table, Badge, Button, Text } from "@medusajs/ui"
import { computeRevenue } from "../lib/metrics"
import { isInfluencerPromotion, parseInfluencerCampaign } from "../types"
import type { InfluencerPromotion } from "../types"

type Props = {
  onNew: () => void
  onSelect: (promo: InfluencerPromotion) => void
  refreshKey: number
}

export function InfluencerTable({ onNew, onSelect, refreshKey }: Props) {
  const [promotions, setPromotions] = useState<InfluencerPromotion[]>([])
  const [revenueMap, setRevenueMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fetch promotions with campaigns and application_method
        const res = await fetch(
          "/admin/promotions?fields=id,code,status,usage_count,*campaigns,*application_method&limit=200",
          { credentials: "include" }
        )
        if (!res.ok) {
          setError("No se pudieron cargar los códigos. Intenta de nuevo.")
          return
        }
        const json = await res.json()
        const all: InfluencerPromotion[] = json.promotions ?? []
        const influencers = all.filter(isInfluencerPromotion)
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

  if (error) {
    return (
      <div className="px-6 py-8 text-center">
        <Text className="text-ui-fg-muted">{error}</Text>
      </div>
    )
  }

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
          const isExpired = !!campaign?.ends_at && new Date(campaign.ends_at) < new Date()
          const revenue = revenueMap[promo.id] ?? 0
          // MX-only: update when multi-currency regions go live
          const revenueFormatted = new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
          }).format(revenue / 100)

          const { influencer_name, handle } = parseInfluencerCampaign(campaign?.name)

          return (
            <Table.Row key={promo.id}>
              <Table.Cell>
                <Text size="small" weight="plus">
                  {influencer_name}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="small" className="text-ui-fg-muted">
                  {handle}
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
