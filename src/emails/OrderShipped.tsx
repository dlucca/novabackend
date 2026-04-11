// src/emails/OrderShipped.tsx
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
  trackingUrl: string
  carrier: string
}

export default function OrderShipped({
  name,
  displayId,
  trackingNumber,
  trackingUrl,
  carrier,
}: Props) {
  return (
    <EmailLayout preview={`Tu pedido #${displayId} está en camino — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
        Tu pedido #{displayId} está en camino
      </Text>

      <OrderStatusTracker currentStep={2} trackingUrl={trackingUrl} />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      <Section style={{ backgroundColor: "#F9FAFB", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 6px" }}>
          Número de guía
        </Text>
        <Text style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: "0 0 4px" }}>
          {trackingNumber}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
          Transportista: {carrier}
        </Text>
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={trackingUrl}
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
          Rastrear mi pedido
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderShipped.defaultProps = {
  name: "Ramiro",
  displayId: "1042",
  trackingNumber: "1Z999AA10123456784",
  trackingUrl: "https://noventa9minutos.mx/rastreo/1Z999AA10123456784",
  carrier: "noventa9minutos",
}
