// src/emails/InfluencerSamplesShipped.tsx
import { Heading, Text, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"
const MUTED = "#A8A29A"

type Props = {
  name: string
  trackingNumber: string
}

export default function InfluencerSamplesShipped({ name, trackingNumber }: Props) {
  return (
    <EmailLayout preview="¡Tus muestras Novapatch están en camino!">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Tus muestras están en camino, {name}! 🎁
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px", lineHeight: "1.6" }}>
        Qué emoción colaborar contigo. Tus parches Novapatch ya están viajando a tu domicilio.
      </Text>

      <Section style={{ backgroundColor: "#FAF8F5", border: "1px solid #E6E1D8", borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <Text style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: MUTED, margin: "0 0 6px", fontFamily: "'JetBrains Mono', monospace" }}>
          NÚMERO DE GUÍA DE RASTREO
        </Text>
        <Text style={{ fontSize: 18, fontWeight: 700, color: DARK, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
          {trackingNumber}
        </Text>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

InfluencerSamplesShipped.defaultProps = {
  name: "Valeria",
  trackingNumber: "ENVIA-PR-39201",
}
