// src/emails/InfluencerSamplesShipped.tsx
//
// Warm, relational email for influencers when their free samples ship.
// Intentionally NOT transactional in tone — no "Tu pedido #X" framing,
// no upsell. The relationship is what we're building, not a sale.

import { Heading, Text, Section, Button, Hr } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY = "#6B7280"

type Props = {
  name: string
  parches: string[]
  trackingNumber: string
  trackingUrl: string
  carrier: string
}

const PARCH_NAMES: Record<string, string> = {
  energy: "Energy",
  sleep: "Sleep",
  glow: "Glow",
  shield: "Shield",
  zen: "Zen",
  woman: "Woman",
}

export default function InfluencerSamplesShipped({
  name,
  parches,
  trackingNumber,
  trackingUrl,
  carrier,
}: Props) {
  const parchList = parches.map((p) => PARCH_NAMES[p] ?? p).join(" · ")

  return (
    <EmailLayout preview={`Tus muestras Novapatch están en camino — ${name}`}>
      <EmailHeader />

      <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: GRAY, fontSize: 15, margin: "0 0 20px", lineHeight: 1.6 }}>
        Qué emoción que vamos a colaborar. Tus muestras ya están viajando hacia ti — esperamos que las disfrutes y nos cuentes qué te parecen.
      </Text>

      <Section style={{ backgroundColor: "#F9FAFB", borderRadius: 8, padding: "16px 20px", marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 6px" }}>
          Tu kit incluye
        </Text>
        <Text style={{ fontSize: 15, fontWeight: 600, color: NAVY, margin: 0 }}>
          {parchList}
        </Text>
      </Section>

      <Section style={{ backgroundColor: "#F9FAFB", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: GRAY, margin: "0 0 6px" }}>
          Número de guía
        </Text>
        <Text style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: "0 0 4px" }}>
          {trackingNumber}
        </Text>
        <Text style={{ fontSize: 13, color: GRAY, margin: 0 }}>
          Transportista: {carrier}
        </Text>
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={trackingUrl}
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
          Rastrear mi kit
        </Button>
      </Section>

      <Hr style={{ borderColor: "#E5E7EB", margin: "20px 0" }} />

      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 8px", lineHeight: 1.6 }}>
        Cuando las recibas, tómate unos días para probarlas con calma. Después
        platiquemos: nos interesa cómo te hicieron sentir, qué notaste, y de
        ahí pensamos juntos cómo podríamos colaborar.
      </Text>

      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 8px", lineHeight: 1.6 }}>
        Si tienes cualquier duda mientras esperas, escríbenos a{" "}
        <a href="mailto:hola@novapatch.care" style={{ color: CORAL, fontWeight: 600 }}>
          hola@novapatch.care
        </a>
        .
      </Text>

      <Text style={{ color: NAVY, fontSize: 14, fontWeight: 600, margin: "20px 0 0" }}>
        Equipo Novapatch
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}

InfluencerSamplesShipped.defaultProps = {
  name: "María",
  parches: ["energy", "sleep", "glow"],
  trackingNumber: "1036356440019",
  trackingUrl: "https://www.envia.com/Tracking/Index?guide=1036356440019",
  carrier: "amPm",
}
