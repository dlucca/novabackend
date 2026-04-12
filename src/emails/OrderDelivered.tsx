// src/emails/OrderDelivered.tsx
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
}

export default function OrderDelivered({ name, displayId, trackingNumber }: Props) {
  const storeUrl = process.env.STORE_CORS ?? "https://novapatch.care"

  return (
    <EmailLayout preview={`Tu pedido #${displayId} fue entregado — Novapatch`}>
      <EmailHeader />

      <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 2px" }}>
        Tu pedido #{displayId} fue entregado
      </Text>

      <OrderStatusTracker currentStep={2} />

      <Hr style={{ borderColor: "#E5E7EB", margin: "4px 0 20px" }} />

      <Section style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
        <Text style={{ fontSize: 14, color: "#15803D", margin: "0 0 4px", fontWeight: 600 }}>
          ¡Entregado con éxito!
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
          Guía: {trackingNumber}
        </Text>
      </Section>

      <Text style={{ fontSize: 14, color: GRAY, margin: "0 0 24px" }}>
        Esperamos que disfrutes tu Novapatch. Si tienes algún problema con tu pedido, escríbenos a hola@novapatch.care.
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={`${storeUrl}/tienda`}
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
          Ver más productos
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

OrderDelivered.defaultProps = {
  name: "Ramiro",
  displayId: "1042",
  trackingNumber: "1Z999AA10123456784",
}
