// src/emails/OrderConfirmation.tsx
import { Heading, Text, Row, Column, Section, Button, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY = "#6B7280"
const LIGHT_GRAY = "#F3F4F6"

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
  last_name?: string
}

type Props = {
  name: string
  displayId: string | number
  items: OrderItem[]
  shippingAddress?: ShippingAddress | null
  currencyCode: string
  trackingUrl?: string
  orderDetailsUrl?: string
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(n)
}

export default function OrderConfirmation({
  name,
  displayId,
  items,
  shippingAddress,
  currencyCode,
  trackingUrl,
  orderDetailsUrl,
}: Props) {
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  const addr = shippingAddress
  const recipientName = addr
    ? [addr.first_name, addr.last_name].filter(Boolean).join(" ")
    : name
  const addressLine1 = addr?.address_1 ?? ""
  const addressLine2 = [addr?.city, addr?.province, addr?.postal_code]
    .filter(Boolean)
    .join(", ")

  const storeUrl = process.env.STORE_CORS ?? "https://novapatch.care"
  const detailsUrl = orderDetailsUrl ?? `${storeUrl}/cuenta/pedidos`

  return (
    <EmailLayout preview={`Tu pedido #${displayId} fue confirmado — Novapatch`}>
      <EmailHeader />

      {/* Order number */}
      <Row>
        <Column>
          <Heading
            style={{
              color: NAVY,
              fontSize: 22,
              margin: "0 0 4px",
              fontWeight: 700,
            }}
          >
            ¡Hola, {name}!
          </Heading>
          <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
            Confirmamos tu pedido
          </Text>
        </Column>
        <Column style={{ textAlign: "right" as const, verticalAlign: "top" as const }}>
          <Text
            style={{
              color: GRAY,
              fontSize: 12,
              margin: 0,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: 1,
            }}
          >
            Pedido
          </Text>
          <Text
            style={{ color: NAVY, fontSize: 15, margin: "2px 0 0", fontWeight: 700 }}
          >
            #{displayId}
          </Text>
        </Column>
      </Row>

      {/* Status tracker */}
      <OrderStatusTracker currentStep={0} trackingUrl={trackingUrl} />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      {/* Shipping info: 2 columns like MOOV */}
      <Row style={{ marginBottom: 20 }}>
        <Column style={{ verticalAlign: "top" as const, paddingRight: 16 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: 1,
              color: GRAY,
              margin: "0 0 6px",
            }}
          >
            Método de envío
          </Text>
          <Text style={{ fontSize: 14, color: NAVY, margin: "0 0 4px", fontWeight: 600 }}>
            Envío estándar
          </Text>
          <Text style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: "1.5" }}>
            3–5 días hábiles
          </Text>
        </Column>
        {addr && (
          <Column style={{ verticalAlign: "top" as const }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: 1,
                color: GRAY,
                margin: "0 0 6px",
              }}
            >
              Dirección de envío
            </Text>
            {recipientName && (
              <Text style={{ fontSize: 14, color: NAVY, margin: "0 0 4px", fontWeight: 600 }}>
                {recipientName}
              </Text>
            )}
            {addressLine1 && (
              <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 2px" }}>
                {addressLine1}
              </Text>
            )}
            {addressLine2 && (
              <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
                {addressLine2}
              </Text>
            )}
          </Column>
        )}
      </Row>

      <Hr style={{ borderColor: "#E5E7EB", margin: "0 0 20px" }} />

      {/* Items table */}
      <Text
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: 1,
          color: GRAY,
          margin: "0 0 12px",
        }}
      >
        Detalle
      </Text>

      {items.map((item, i) => {
        const isSub = item.metadata?.is_subscription === true
        return (
          <Section
            key={i}
            style={{
              borderTop: i === 0 ? `2px solid ${NAVY}` : "1px solid #E5E7EB",
              padding: "10px 0",
            }}
          >
            <Row>
              <Column style={{ fontSize: 14, color: "#1F2937" }}>
                {item.title}
                {isSub && (
                  <Text
                    style={{
                      display: "inline",
                      fontSize: 11,
                      color: CORAL,
                      fontWeight: 600,
                      marginLeft: 6,
                    }}
                  >
                    · Suscripción
                  </Text>
                )}
              </Column>
              <Column
                style={{
                  textAlign: "center" as const,
                  width: 48,
                  fontSize: 14,
                  color: GRAY,
                }}
              >
                ×{item.quantity}
              </Column>
              <Column
                style={{
                  textAlign: "right" as const,
                  width: 90,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#1F2937",
                }}
              >
                {fmt(item.unit_price * item.quantity, currencyCode)}
              </Column>
            </Row>
          </Section>
        )
      })}

      {/* Total */}
      <Section
        style={{ borderTop: `2px solid ${NAVY}`, padding: "12px 0 20px" }}
      >
        <Row>
          <Column style={{ textAlign: "right" as const, paddingRight: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>
              Total
            </Text>
          </Column>
          <Column
            style={{ textAlign: "right" as const, width: 90 }}
          >
            <Text style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>
              {fmt(total, currencyCode)}
            </Text>
          </Column>
        </Row>
      </Section>

      {/* CTA */}
      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={detailsUrl}
          style={{
            backgroundColor: CORAL,
            color: "#ffffff",
            borderRadius: 6,
            padding: "13px 28px",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Ver detalles de mi pedido
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderConfirmation.defaultProps = {
  name: "Ramiro",
  displayId: "1042",
  currencyCode: "mxn",
  items: [
    { title: "Parche Energía Novapatch", quantity: 1, unit_price: 450, metadata: {} },
    { title: "Parche Sueño Profundo", quantity: 2, unit_price: 380, metadata: { is_subscription: true } },
  ],
  shippingAddress: {
    first_name: "Ramiro",
    last_name: "Dlucca",
    address_1: "Av. Insurgentes Sur 1234",
    city: "Ciudad de México",
    province: "CDMX",
    postal_code: "03100",
  },
}
