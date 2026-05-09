// src/emails/OrderConfirmation.tsx
import { Heading, Text, Row, Column, Section, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY = "#6B7280"

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
  estimatedDelivery?: string
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
  estimatedDelivery,
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
      <OrderStatusTracker currentStep={0} />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      {/* Shipping info */}
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

      {estimatedDelivery && (
        <Text style={{ fontSize: 14, color: "#425066", margin: "12px 0" }}>
          Envío estimado: <strong style={{ color: "#0D1B35" }}>{estimatedDelivery}</strong>.{" "}
          Te enviaremos la guía por email en las próximas 24 horas.
        </Text>
      )}

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

      {/* Usage tips */}
      <Section
        style={{
          backgroundColor: "#F4F7FB",
          borderRadius: 8,
          padding: "16px 18px",
          margin: "0 0 20px",
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: 1,
            color: NAVY,
            margin: "0 0 8px",
          }}
        >
          Tips para usarlo bien
        </Text>
        <Text style={{ fontSize: 14, color: "#1F2937", margin: 0, lineHeight: "1.6" }}>
          Úsalo entre 8 y 10 horas, cambia la zona donde lo colocas cada vez que uses
          uno nuevo y retíralo con cuidado. Si lo humedeces con agua o lo quitas en la
          ducha, sale más fácil y evitas jalar la piel.
        </Text>
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
