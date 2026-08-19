// src/emails/OrderConfirmation.tsx
import { Heading, Text, Row, Column, Section, Hr, Link } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const DARK = "#0F0F0F"
const GRAY_TEXT = "#3A3A37"
const MUTED = "#A8A29A"

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

      {/* Greeting and Order ID Header */}
      <Row style={{ marginBottom: 20 }}>
        <Column style={{ verticalAlign: "top" as const }}>
          <Heading
            style={{
              color: DARK,
              fontSize: 22,
              margin: "0 0 4px",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            ¡Hola, {name}!
          </Heading>
          <Text style={{ color: GRAY_TEXT, fontSize: 14, margin: 0 }}>
            Confirmamos tu pedido.
          </Text>
        </Column>
        <Column style={{ textAlign: "right" as const, verticalAlign: "top" as const }}>
          <Text
            style={{
              color: MUTED,
              fontSize: 10,
              margin: "0 0 2px",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.12em",
              fontFamily: "'JetBrains Mono', monospace, sans-serif",
            }}
          >
            PEDIDO
          </Text>
          <Text
            style={{
              color: DARK,
              fontSize: 18,
              margin: 0,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace, sans-serif",
            }}
          >
            #{displayId}
          </Text>
        </Column>
      </Row>

      {/* Status tracker */}
      <OrderStatusTracker currentStep={0} />

      {/* Shipping info */}
      <Row style={{ marginBottom: 24, marginTop: 24 }}>
        <Column style={{ verticalAlign: "top" as const, paddingRight: 14, width: "50%" }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.12em",
              color: MUTED,
              margin: "0 0 6px",
              fontFamily: "'JetBrains Mono', monospace, sans-serif",
            }}
          >
            MÉTODO DE ENVÍO
          </Text>
          <Text style={{ fontSize: 13, color: DARK, margin: "0 0 2px", fontWeight: 700 }}>
            Envío Estándar Express
          </Text>
          <Text style={{ fontSize: 13, color: GRAY_TEXT, margin: 0 }}>
            3–5 días hábiles
          </Text>
        </Column>
        {addr && (
          <Column style={{ verticalAlign: "top" as const, paddingLeft: 14, width: "50%" }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.12em",
                color: MUTED,
                margin: "0 0 6px",
                fontFamily: "'JetBrains Mono', monospace, sans-serif",
              }}
            >
              DIRECCIÓN DE ENVÍO
            </Text>
            {recipientName && (
              <Text style={{ fontSize: 13, color: DARK, margin: "0 0 2px", fontWeight: 700 }}>
                {recipientName}
              </Text>
            )}
            {addressLine1 && (
              <Text style={{ fontSize: 13, color: GRAY_TEXT, margin: "0 0 2px" }}>
                {addressLine1}
              </Text>
            )}
            {addressLine2 && (
              <Text style={{ fontSize: 13, color: GRAY_TEXT, margin: 0 }}>
                {addressLine2}
              </Text>
            )}
          </Column>
        )}
      </Row>

      {estimatedDelivery && (
        <Section
          style={{
            backgroundColor: "#FAF8F5",
            border: "1px solid #E6E1D8",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "24px",
          }}
        >
          <Text style={{ fontSize: 13, color: GRAY_TEXT, margin: 0, lineHeight: "1.5" }}>
            Envío estimado: <strong style={{ color: DARK }}>{estimatedDelivery}</strong>.{" "}
            Te enviaremos la guía por email en las próximas 24 horas.
          </Text>
        </Section>
      )}

      <Hr style={{ borderColor: "#E6E1D8", margin: "0 0 20px" }} />

      {/* Items table */}
      <Text
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.12em",
          color: MUTED,
          margin: "0 0 12px",
          fontFamily: "'JetBrains Mono', monospace, sans-serif",
        }}
      >
        DETALLE DEL PEDIDO
      </Text>

      {items.map((item, i) => {
        const isSub = item.metadata?.is_subscription === true
        return (
          <Section
            key={i}
            style={{
              borderBottom: "1px solid #E6E1D8",
              padding: "12px 0",
            }}
          >
            <Row>
              <Column style={{ fontSize: 14, fontWeight: 600, color: DARK }}>
                {item.title}
                {isSub && (
                  <Text
                    style={{
                      display: "inline",
                      fontSize: 11,
                      color: DARK,
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
                  fontSize: 13,
                  color: MUTED,
                  fontFamily: "'JetBrains Mono', monospace, sans-serif",
                }}
              >
                ×{item.quantity}
              </Column>
              <Column
                style={{
                  textAlign: "right" as const,
                  width: 100,
                  fontSize: 14,
                  fontWeight: 700,
                  color: DARK,
                  fontFamily: "'JetBrains Mono', monospace, sans-serif",
                }}
              >
                {fmt(item.unit_price * item.quantity, currencyCode)}
              </Column>
            </Row>
          </Section>
        )
      })}

      {/* Total */}
      <Section style={{ padding: "16px 0 24px" }}>
        <Row>
          <Column style={{ textAlign: "right" as const, paddingRight: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: 700, color: DARK, margin: 0 }}>
              Total
            </Text>
          </Column>
          <Column style={{ textAlign: "right" as const, width: 110 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: DARK,
                margin: 0,
                fontFamily: "'JetBrains Mono', monospace, sans-serif",
              }}
            >
              {fmt(total, currencyCode)}
            </Text>
          </Column>
        </Row>
      </Section>

      {/* Usage tips */}
      <Section
        style={{
          backgroundColor: "#FAF8F5",
          border: "1px solid #E6E1D8",
          borderRadius: "14px",
          padding: "20px 24px",
          marginBottom: "28px",
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: "0.12em",
            color: DARK,
            margin: "0 0 8px",
            fontFamily: "'JetBrains Mono', monospace, sans-serif",
          }}
        >
          TIPS PARA USAR TU PARCHE
        </Text>
        <Text style={{ fontSize: 13, color: GRAY_TEXT, margin: 0, lineHeight: "1.6" }}>
          Úsalo entre 8 y 10 horas sobre la piel limpia y seca. Alterna la zona de colocación cada día (antebrazos, hombros o espalda alta). Si lo humedeces ligeramente antes de retirarlo, se desprende con total suavidad.
        </Text>
      </Section>

      {/* CTA Button */}
      <Section style={{ textAlign: "center" as const, marginBottom: "16px" }}>
        <Link
          href="https://www.novapatch.care/mx/cuenta"
          style={{
            backgroundColor: DARK,
            color: "#FFFFFF",
            border: `1px solid ${DARK}`,
            fontSize: "11px",
            fontFamily: "-apple-system, BlinkMacSystemFont, Roboto, sans-serif",
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.12em",
            padding: "14px 32px",
            borderRadius: "100px",
            display: "inline-block",
            textDecoration: "none",
          }}
        >
          VER DETALLE DE TU PEDIDO
        </Link>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderConfirmation.defaultProps = {
  name: "Cristian",
  displayId: "120",
  currencyCode: "mxn",
  items: [
    { title: "Novapatch Sleep", quantity: 1, unit_price: 750, metadata: {} },
  ],
  shippingAddress: {
    first_name: "Cristian",
    last_name: "Dlucca",
    address_1: "Laguna de Mayran 166 Int C704",
    city: "Ciudad de México",
    province: "Ciudad de México",
    postal_code: "11320",
  },
}
