// src/emails/SubscriptionUpcomingCharge.tsx
import { Heading, Text, Link } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type Props = {
  customerName: string
  productTitle: string
  nextBillingDate: string  // ISO string
  interval_days: number
}

function intervalLabel(days: number) {
  if (days === 30) return "mensual"
  if (days === 60) return "bimestral"
  return "trimestral"
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso))
}

export default function SubscriptionUpcomingCharge({
  customerName,
  productTitle,
  nextBillingDate,
  interval_days,
}: Props) {
  const formattedDate = formatDate(nextBillingDate)
  const frequency = intervalLabel(interval_days)

  return (
    <EmailLayout preview={`Tu parche ${productTitle} se renueva el ${formattedDate}`}>
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        Tu suscripción se renueva pronto
      </Heading>

      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Hola, {customerName}.
      </Text>

      <Text style={{ color: "#1a1a1a", margin: "0 0 12px" }}>
        Tu suscripción de <strong>{productTitle}</strong> se renovará el{" "}
        <strong>{formattedDate}</strong> (frecuencia: {frequency}).
      </Text>

      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Si deseas pausar o cancelar, puedes hacerlo desde tu cuenta antes de esa fecha en{" "}
        <Link href="https://novapatch.care/cuenta/suscripciones" style={{ color: "#17B8A3" }}>
          novapatch.care
        </Link>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionUpcomingCharge.defaultProps = {
  customerName: "Ramiro",
  productTitle: "Parche Energía Novapatch",
  nextBillingDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  interval_days: 30,
}
