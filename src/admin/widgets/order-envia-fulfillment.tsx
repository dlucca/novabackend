// src/admin/widgets/order-envia-fulfillment.tsx
//
// Admin widget injected into the order detail page.
// Shows Envia shipping info (carrier, tracking, label PDF) for each fulfillment
// that was generated via the envia-create-fulfillment workflow.
//
// Placement: order detail page, below the native fulfillment card.

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { Container, Heading, Text, Badge, Button, toast } from "@medusajs/ui"
import { ArrowDownTray, SquaresPlus } from "@medusajs/icons"

// ─── Types ────────────────────────────────────────────────────────────────────

type FulfillmentLabel = {
  id: string
  tracking_number: string
  tracking_url: string
  label_url: string
}

type Fulfillment = {
  id: string
  shipped_at: string | null
  delivered_at: string | null
  canceled_at: string | null
  metadata: Record<string, unknown> | null
  labels: FulfillmentLabel[]
}

type OrderFulfillmentWidgetProps = {
  data: { id: string }
}

// ─── Widget ───────────────────────────────────────────────────────────────────

const OrderEnviaFulfillmentWidget = ({ data: order }: OrderFulfillmentWidgetProps) => {
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFulfillments = async () => {
      try {
        const res = await fetch(
          `/admin/orders/${order.id}?fields=id,*fulfillments,*fulfillments.labels`,
          { credentials: "include" }
        )
        if (!res.ok) return
        const json = await res.json()
        const all: Fulfillment[] = json.order?.fulfillments ?? []
        // Only show fulfillments with Envia metadata
        const enviaFulfillments = all.filter(
          (f) =>
            f.metadata?.envia_shipment_id ||
            f.metadata?.envia_label_url ||
            (f.labels ?? []).length > 0
        )
        setFulfillments(enviaFulfillments)
      } catch {
        // silently fail — don't break the admin if widget errors
      } finally {
        setLoading(false)
      }
    }
    fetchFulfillments()
  }, [order.id])

  // Don't render anything if no Envia fulfillments
  if (!loading && fulfillments.length === 0) return null

  if (loading) return null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Envío Envia</Heading>
      </div>

      {fulfillments.map((fulfillment, idx) => {
        const label = fulfillment.labels?.[0]
        const trackingNumber =
          label?.tracking_number ??
          (fulfillment.metadata?.tracking_number as string | undefined)
        const trackingUrl =
          label?.tracking_url ??
          (fulfillment.metadata?.envia_track_url as string | undefined)
        const labelUrl =
          label?.label_url ??
          (fulfillment.metadata?.envia_label_url as string | undefined)
        const carrier = fulfillment.metadata?.carrier as string | undefined
        const service = fulfillment.metadata?.service as string | undefined
        const shipmentId = fulfillment.metadata?.envia_shipment_id as string | undefined
        const cost = fulfillment.metadata?.envia_carrier_cost as string | undefined
        const currency = fulfillment.metadata?.envia_currency as string | undefined

        const statusBadge = fulfillment.canceled_at
          ? { label: "Cancelado", color: "red" as const }
          : fulfillment.delivered_at
          ? { label: "Entregado", color: "green" as const }
          : fulfillment.shipped_at
          ? { label: "En tránsito", color: "blue" as const }
          : { label: "Preparando", color: "orange" as const }

        return (
          <div key={fulfillment.id} className="px-6 py-4 space-y-4">
            {fulfillments.length > 1 && (
              <Text size="small" className="text-ui-fg-subtle font-medium">
                Fulfillment #{idx + 1}
              </Text>
            )}

            {/* Carrier + status */}
            <div className="flex items-center gap-3">
              <Badge color={statusBadge.color}>{statusBadge.label}</Badge>
              {carrier && (
                <Text size="small" className="text-ui-fg-subtle capitalize">
                  {carrier}
                  {service ? ` · ${service}` : ""}
                  {cost ? ` · $${cost} ${currency ?? "MXN"}` : ""}
                </Text>
              )}
              {shipmentId && (
                <Text size="small" className="text-ui-fg-muted">
                  ID: {shipmentId}
                </Text>
              )}
            </div>

            {/* Tracking number */}
            {trackingNumber ? (
              <div className="bg-ui-bg-subtle rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <Text size="xsmall" className="text-ui-fg-muted mb-0.5">
                    Número de guía
                  </Text>
                  <Text size="base" className="font-mono font-medium">
                    {trackingNumber}
                  </Text>
                </div>
                <Button
                  variant="transparent"
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(trackingNumber)
                    toast.success("Copiado al portapapeles")
                  }}
                >
                  Copiar
                </Button>
              </div>
            ) : (
              <div className="bg-ui-bg-subtle rounded-lg px-4 py-3">
                <Text size="small" className="text-ui-fg-muted">
                  Número de guía no disponible
                </Text>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {trackingUrl && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => window.open(trackingUrl, "_blank")}
                >
                  <SquaresPlus className="mr-1.5" />
                  Rastrear envío
                </Button>
              )}
              {labelUrl && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => window.open(labelUrl, "_blank")}
                >
                  <ArrowDownTray className="mr-1.5" />
                  Descargar guía (PDF)
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </Container>
  )
}

// Inject into the order detail page
export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderEnviaFulfillmentWidget
