// src/emails/SubscriptionRenewed.tsx
import { Heading, Text, Row, Column, Section, Link } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type Props = {
  customerName: string
  amount: number
  currencyCode: string
  cycleNumber: number
  nextBillingDate: string   // ISO string
  openpayChargeId: string
}

export default function SubscriptionRenewed({
  customerName,
  amount,
  currencyCode,
  cycleNumber,
  nextBillingDate,
  openpayChargeId,
}: Props) {
  const formattedAmount = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amount)

  const formattedDate = new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(nextBillingDate))

  const rows: [string, string][] = [
    ["Ciclo", String(cycleNumber)],
    ["Monto cobrado", formattedAmount],
    ["Referencia Openpay", openpayChargeId],
    ["Próximo cargo", formattedDate],
  ]

  return (
    <EmailLayout preview={`Novapatch — Cargo realizado: ${formattedAmount}`}>
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        Tu suscripción fue renovada
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Hola, {customerName || "cliente"}. Realizamos el cargo de{" "}
        <strong>{formattedAmount}</strong> a tu tarjeta registrada.
      </Text>

      {rows.map(([label, value], i) => (
        <Section key={i} style={{ borderBottom: "1px solid #eeeeee" }}>
          <Row>
            <Column style={{ color: "#6b7280", fontSize: "14px", padding: "8px 0" }}>{label}</Column>
            <Column style={{ fontSize: "14px", padding: "8px 0", textAlign: "right" as const }}>{value}</Column>
          </Row>
        </Section>
      ))}

      <Text style={{ color: "#1a1a1a", marginTop: "20px" }}>
        ¿Tienes alguna duda? Escríbenos a{" "}
        <Link href="mailto:hola@novapatch.care" style={{ color: "#17B8A3" }}>
          hola@novapatch.care
        </Link>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionRenewed.defaultProps = {
  customerName: "Ramiro",
  amount: 45000,
  currencyCode: "mxn",
  cycleNumber: 2,
  nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  openpayChargeId: "ch_ABC123xyz",
}
