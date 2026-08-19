// src/emails/SubscriptionRenewed.tsx
import { Heading, Text, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type Props = {
  customerName: string
  amount?: number
  currencyCode?: string
  cycleNumber?: number
  nextBillingDate?: string
  openpayChargeId?: string
}

export default function SubscriptionRenewed({
  customerName,
}: Props) {
  return (
    <EmailLayout preview="¡Renovación de suscripción procesada con éxito!">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Renovación procesada con éxito!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Hola {customerName}, confirmamos el cobro de tu plan <strong>Suscripción Pack Día & Noche</strong> por <strong>$1,275.00 MXN</strong>.
      </Text>

      <Text style={{ fontSize: 13, color: GRAY, margin: "0 0 24px", lineHeight: "1.6" }}>
        Estamos preparando tu pedido y te enviaremos la guía de rastreo en cuanto salga de nuestro almacén.
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionRenewed.defaultProps = {
  customerName: "Cristian",
  amount: 127500,
  currencyCode: "mxn",
  cycleNumber: 2,
}
