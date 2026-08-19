// src/emails/OrderDelivered.tsx
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
}

export default function OrderDelivered({ name, displayId, trackingNumber }: Props) {
  const storeUrl = process.env.STORE_CORS ?? "https://novapatch.care"

  return (
    <EmailLayout preview={`Tu pedido #${displayId} fue entregado — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Tu pedido #{displayId} ha sido entregado en tu domicilio.
      </Text>

      <OrderStatusTracker currentStep={2} />

      <Hr style={{ borderColor: "#E6E1D8", margin: "16px 0 20px" }} />

      <Section style={{ backgroundColor: "#FAF8F5", border: "1px solid #E6E1D8", borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <Text style={{ fontSize: 14, color: DARK, margin: "0 0 4px", fontWeight: 700 }}>
          ¡Entregado con éxito! 🎉
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
          Guía: <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{trackingNumber}</strong>
        </Text>
      </Section>

      <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 24px", lineHeight: "1.6" }}>
        Esperamos que disfrutes tu Novapatch. Si tienes algún problema con tu pedido, escríbenos a hola@novapatch.care.
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={`${storeUrl}/tienda`}
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
          Ver más productos
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderDelivered.defaultProps = {
  name: "Cristian",
  displayId: "120",
  trackingNumber: "ENVIA-98420194",
}
