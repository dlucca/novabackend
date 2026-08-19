// src/emails/SubscriptionPaymentFailed.tsx
import { Heading, Text, Section, Button } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type Props = {
  customerName: string
  reason?: string
  error?: string
  frontendUrl?: string
}

export default function SubscriptionPaymentFailed({ customerName, reason, error }: Props) {
  return (
    <EmailLayout preview="Novapatch — Problema con tu pago de suscripción">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        No pudimos procesar tu pago de suscripción
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Hola {customerName}, la tarjeta asociada a tu plan <strong>Suscripción Pack Día & Noche</strong> fue rechazada.
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Button
          href="https://www.novapatch.care/mx/cuenta"
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
          ACTUALIZAR MÉTODO DE PAGO
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionPaymentFailed.defaultProps = {
  customerName: "Cristian",
  reason: "charge_failed",
}
