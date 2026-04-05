// src/emails/SubscriptionPaymentFailed.tsx
import { Heading, Text, Link, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type Props = {
  customerName: string
  reason: string
  error?: string
  frontendUrl: string
}

export function SubscriptionPaymentFailed({ customerName, reason, error, frontendUrl }: Props) {
  const reasonText =
    reason === "no_card"
      ? "No encontramos una tarjeta registrada en tu cuenta."
      : "El cargo a tu tarjeta fue rechazado."

  return (
    <EmailLayout preview="Novapatch — Problema con tu pago de suscripción">
      {/* Red-tinted header band */}
      <Section style={{ backgroundColor: "#FEF2F2", borderRadius: "6px", padding: "20px", marginBottom: "24px" }}>
        <EmailHeader />
        <Heading style={{ color: "#DC2626", fontSize: "22px", margin: "0 0 4px", textAlign: "center" as const }}>
          No pudimos procesar tu pago
        </Heading>
      </Section>

      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Hola, {customerName || "cliente"}.
      </Text>
      <Text style={{ color: "#1a1a1a", margin: "0 0 16px" }}>
        Tuvimos un problema al cobrar tu suscripción Novapatch. Tu suscripción quedó pausada temporalmente para que puedas actualizar tu método de pago.
      </Text>

      {/* Alert box */}
      <Section
        style={{
          backgroundColor: "#FEF2F2",
          borderLeft: "4px solid #DC2626",
          borderRadius: "4px",
          padding: "12px 16px",
          margin: "0 0 20px",
        }}
      >
        <Text style={{ color: "#991b1b", fontSize: "14px", margin: 0 }}>
          {reasonText}
          {error ? ` Detalle: ${error}` : ""}
        </Text>
      </Section>

      <Text style={{ color: "#1a1a1a", fontWeight: 600, margin: "0 0 8px" }}>
        Para reactivar tu suscripción:
      </Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>1. Ingresa a tu cuenta en novapatch.care</Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>2. Ve a <strong>Mi cuenta → Suscripciones</strong></Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>3. Actualiza tu método de pago</Text>
      <Text style={{ color: "#1a1a1a", margin: "4px 0 20px", paddingLeft: "16px" }}>4. Reanuda tu suscripción</Text>

      {/* Navy CTA button */}
      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Link
          href={`${frontendUrl}/cuenta/suscripciones`}
          style={{
            backgroundColor: "#003D70",
            color: "#ffffff",
            padding: "12px 28px",
            borderRadius: "6px",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: "15px",
            display: "inline-block",
          }}
        >
          Actualizar método de pago
        </Link>
      </Section>

      <Text style={{ color: "#1a1a1a", marginTop: "8px" }}>
        ¿Necesitas ayuda? Escríbenos a{" "}
        <Link href="mailto:hola@novapatch.care" style={{ color: "#17B8A3" }}>
          hola@novapatch.care
        </Link>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}
