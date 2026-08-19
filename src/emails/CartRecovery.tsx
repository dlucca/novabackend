// src/emails/CartRecovery.tsx
import { Heading, Text, Section, Button } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type Props = {
  recoveryUrl?: string
}

export default function CartRecovery({ recoveryUrl }: Props) {
  return (
    <EmailLayout preview="Tus parches Novapatch te están esperando">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 8px", fontWeight: 700 }}>
        Tus parches Novapatch te están esperando
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px", lineHeight: "1.6" }}>
        Hola Cristian, notamos que dejaste algunos productos seleccionados en tu carrito. Guardamos tu selección para que retomes tu pedido cuando gustes.
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Button
          href={recoveryUrl || "https://www.novapatch.care/mx/checkout"}
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
          VOLVER A MI CARRITO
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

CartRecovery.defaultProps = {
  recoveryUrl: "https://www.novapatch.care/mx/checkout",
}
