// src/emails/SubscriptionWelcome.tsx
import { Heading, Text, Section, Link } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type SubscriptionItem = {
  title: string
  interval_days: number
}

type Props = {
  name: string
  orderId: string | number
  subscriptionItems: SubscriptionItem[]
}

function intervalLabel(days: number) {
  if (days === 30) return "mensual"
  if (days === 60) return "bimestral"
  return "trimestral"
}

export default function SubscriptionWelcome({ name, orderId, subscriptionItems }: Props) {
  return (
    <EmailLayout preview="¡Tu suscripción Novapatch está activa!">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Bienvenido a tu suscripción, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Tu pedido <strong>#{orderId}</strong> fue confirmado y tu plan de bienestar ya está activo.
      </Text>

      <Section style={{ backgroundColor: "#FAF8F5", border: "1px solid #E6E1D8", borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <Text style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: "1.6" }}>
          A partir de hoy recibirás tus parches automáticamente en la puerta de tu casa. Podrás pausar, modificar o cancelar tu plan en cualquier momento desde tu panel de usuario.
        </Text>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionWelcome.defaultProps = {
  name: "Cristian",
  orderId: "120",
  subscriptionItems: [
    { title: "Parche Energía Novapatch", interval_days: 30 },
  ],
}
