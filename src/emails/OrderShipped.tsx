// src/emails/OrderShipped.tsx
import { Heading, Text, Section, Button, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"
import { OrderStatusTracker } from "./components/OrderStatusTracker"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"
const MUTED = "#A8A29A"

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

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Tu pedido #{displayId} está en camino.
      </Text>

      <OrderStatusTracker currentStep={1} trackingUrl={trackingUrl} />

      <Hr style={{ borderColor: "#E6E1D8", margin: "16px 0 20px" }} />

      <Section style={{ backgroundColor: "#FAF8F5", border: "1px solid #E6E1D8", borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <Text style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: MUTED, margin: "0 0 6px", fontFamily: "'JetBrains Mono', monospace" }}>
          NÚMERO DE GUÍA DE RASTREO
        </Text>
        <Text style={{ fontSize: 18, fontWeight: 700, color: DARK, margin: "0 0 4px", fontFamily: "'JetBrains Mono', monospace" }}>
          {trackingNumber}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
          Paquetería: <strong>{carrier}</strong>
        </Text>
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={trackingUrl}
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
          Rastrear mi pedido en vivo
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderShipped.defaultProps = {
  name: "Cristian",
  displayId: "120",
  trackingNumber: "ENVIA-98420194",
  trackingUrl: "https://www.envia.com/tracking?id=ENVIA-98420194",
  carrier: "Envía.com Express",
}
