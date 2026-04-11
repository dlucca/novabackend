// src/emails/OrderDeliveryFailed.tsx
import { Heading, Text, Section, Button, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY = "#6B7280"

type Props = {
  name: string
  displayId: string | number
  trackingNumber: string
  status: "failed" | "returned"
  failureReason?: string
}

export default function OrderDeliveryFailed({
  name,
  displayId,
  trackingNumber,
  status,
  failureReason,
}: Props) {
  const isReturned = status === "returned"
  const headline = isReturned
    ? `Tu pedido #${displayId} fue devuelto`
    : `No pudimos entregar tu pedido #${displayId}`
  const bodyText = isReturned
    ? "El paquete fue regresado al remitente. Contáctanos para coordinar una nueva entrega."
    : "El transportista intentó entregar tu pedido pero no fue posible completarlo. Contáctanos para ayudarte."

  return (
    <EmailLayout preview={`${headline} — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
        {headline}
      </Text>

      <OrderStatusTracker currentStep={2} variant="failed" />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      <Section style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
        <Text style={{ fontSize: 14, color: "#DC2626", margin: "0 0 4px", fontWeight: 600 }}>
          {isReturned ? "Pedido devuelto" : "Entrega fallida"}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 8px" }}>
          {bodyText}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 4px" }}>
          Guía: {trackingNumber}
        </Text>
        {failureReason && (
          <Text style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
            Detalle del transportista: {failureReason}
          </Text>
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href="mailto:hola@novapatch.care"
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
          Contactar soporte
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderDeliveryFailed.defaultProps = {
  name: "Ramiro",
  displayId: "1042",
  trackingNumber: "1Z999AA10123456784",
  status: "failed" as "failed" | "returned",
  failureReason: "Destinatario no encontrado en domicilio",
}
