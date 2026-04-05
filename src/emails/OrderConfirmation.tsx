// src/emails/OrderConfirmation.tsx
import { Heading, Text, Row, Column, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type OrderItem = {
  title: string
  quantity: number
  unit_price: number
  metadata?: Record<string, unknown>
}

type ShippingAddress = {
  address_1?: string
  address_2?: string
  city?: string
  province?: string
  postal_code?: string
  first_name?: string
}

type Props = {
  name: string
  displayId: string | number
  items: OrderItem[]
  shippingAddress?: ShippingAddress | null
  currencyCode: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(n)
}

export function OrderConfirmation({ name, displayId, items, shippingAddress, currencyCode }: Props) {
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const addr = shippingAddress
  const addressText = addr
    ? `${addr.address_1 ?? ""}${addr.address_2 ? `, ${addr.address_2}` : ""}, ${addr.city ?? ""}, ${addr.province ?? ""} ${addr.postal_code ?? ""}`
    : "No disponible"

  return (
    <EmailLayout preview={`Tu pedido #${displayId} fue confirmado — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        ¡Gracias por tu compra, {name}!
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 24px" }}>
        Tu pedido <strong>#{displayId}</strong> ha sido confirmado.
      </Text>

      {/* Table header */}
      <Section style={{ borderBottom: "2px solid #003D70", marginBottom: "0" }}>
        <Row>
          <Column style={{ fontWeight: 700, fontSize: "14px", paddingBottom: "8px" }}>Producto</Column>
          <Column style={{ fontWeight: 700, fontSize: "14px", paddingBottom: "8px", textAlign: "center" as const, width: "60px" }}>Cant.</Column>
          <Column style={{ fontWeight: 700, fontSize: "14px", paddingBottom: "8px", textAlign: "right" as const, width: "90px" }}>Total</Column>
        </Row>
      </Section>

      {/* Items */}
      {items.map((item, i) => {
        const isSub = item.metadata?.is_subscription === true
        return (
          <Section key={i} style={{ borderBottom: "1px solid #eeeeee" }}>
            <Row>
              <Column style={{ fontSize: "14px", padding: "8px 0" }}>
                {item.title}{isSub ? " 🔄 Suscripción" : ""}
              </Column>
              <Column style={{ fontSize: "14px", padding: "8px 0", textAlign: "center" as const, width: "60px" }}>
                {item.quantity}
              </Column>
              <Column style={{ fontSize: "14px", padding: "8px 0", textAlign: "right" as const, width: "90px" }}>
                {fmt(item.unit_price * item.quantity, currencyCode)}
              </Column>
            </Row>
          </Section>
        )
      })}

      {/* Total */}
      <Section>
        <Row>
          <Column style={{ textAlign: "right" as const, fontWeight: 700, paddingTop: "12px", paddingRight: "8px" }}>
            Total:
          </Column>
          <Column style={{ textAlign: "right" as const, fontWeight: 700, color: "#003D70", paddingTop: "12px", width: "90px" }}>
            {fmt(total, currencyCode)}
          </Column>
        </Row>
      </Section>

      <Heading as="h3" style={{ color: "#003D70", fontSize: "16px", marginTop: "24px" }}>
        Dirección de envío
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>{addressText}</Text>

      <Text style={{ color: "#1a1a1a" }}>
        Te notificaremos cuando tu pedido sea enviado.
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}
