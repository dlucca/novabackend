// src/emails/SubscriptionUpcomingCharge.tsx
import { Heading, Text, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type Props = {
  customerName: string
  productTitle: string
  nextBillingDate: string
  interval_days: number
}

export default function SubscriptionUpcomingCharge({
  customerName,
  productTitle,
  nextBillingDate,
}: Props) {
  return (
    <EmailLayout preview="Tu suscripción Novapatch se renueva pronto">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        Tu suscripción se renueva pronto
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Hola {customerName}, te recordamos que tu plan <strong>{productTitle}</strong> se procesará pronto.
      </Text>

      <Section style={{ backgroundColor: "#FAF8F5", border: "1px solid #E6E1D8", borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 6px" }}>
          Monto a cobrar: <strong>$1,275.00 MXN</strong>
        </Text>
        <Text style={{ fontSize: 12, color: "#A8A29A", margin: 0 }}>
          Si deseas hacer cambios en la dirección o pausar la entrega, puedes hacerlo desde tu cuenta antes de esa fecha.
        </Text>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionUpcomingCharge.defaultProps = {
  customerName: "Cristian",
  productTitle: "Suscripción Pack Día & Noche",
  nextBillingDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  interval_days: 30,
}
