// src/emails/AdminInvite.tsx
import { Heading, Text, Section, Button } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const DARK = "#0F0F0F"
const GRAY = "#3A3A37"

type Props = {
  inviteUrl: string
  email: string
}

export default function AdminInvite({ inviteUrl, email }: Props) {
  return (
    <EmailLayout preview="Te invitaron al panel de administración de Novapatch">
      <EmailHeader />

      <Heading style={{ color: DARK, fontSize: 22, margin: "0 0 4px", fontWeight: 700 }}>
        Te invitaron al equipo de Novapatch
      </Heading>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 20px" }}>
        Recibiste acceso para ingresar al panel de administración con el correo <strong>{email}</strong>.
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Button
          href={inviteUrl}
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
          ACEPTAR INVITACIÓN
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

AdminInvite.defaultProps = {
  inviteUrl: "https://admin.novapatch.care/invite?token=xyz",
  email: "nuevoadmin@novapatch.care",
}
