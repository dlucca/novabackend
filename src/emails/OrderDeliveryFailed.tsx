// src/emails/OrderDeliveryFailed.tsx
import { Heading, Text, Section, Button, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type Props = {
  name: string
  displayId: string | number
  trackingNumber: string
  status?: "failed" | "returned"
  failureReason?: string
  reason?: string
}

export default function OrderDeliveryFailed({
  name,
  displayId,
  trackingNumber,
  status,
  failureReason,
  reason,
}: Props) {
  const isReturned = status === "returned"
  const headline = isReturned
    ? `Tu pedido #${displayId} fue devuelto`
    : `No pudimos entregar tu pedido #${displayId}`

  return (
    <EmailLayout preview={`${headline} — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        La paquetería no pudo completar la entrega de tu pedido #{displayId}.
      </Text>

      <OrderStatusTracker currentStep={2} variant="failed" />

      <Hr style={{ borderColor: "#E6E1D8", margin: "16px 0 20px" }} />

      <Section style={{ backgroundColor: "#FAF8F5", border: "1px solid #E6E1D8", borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <Text style={{ fontSize: 14, color: DARK, margin: "0 0 6px", fontWeight: 700 }}>
          Aviso de Entrega Pendiente
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 6px" }}>
          El transportista intentó entregar tu pedido pero no fue posible completarlo.
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 4px" }}>
          Guía: <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{trackingNumber}</strong>
        </Text>
        {(failureReason || reason) && (
          <Text style={{ fontSize: 12, color: "#A8A29A", margin: 0 }}>
            Detalle: {failureReason || reason}
          </Text>
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href="mailto:hola@novapatch.care"
          style={{
            backgroundColor: DARK,
            color: "#ffffff",
            borderRadius: 100,
            padding: "14px 32px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
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
  name: "Cristian",
  displayId: "120",
  trackingNumber: "ENVIA-98420194",
  status: "failed" as "failed" | "returned",
  reason: "Dirección incompleta o sin respuesta en domicilio",
}
