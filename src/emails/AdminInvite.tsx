// src/emails/AdminInvite.tsx
import { Heading, Text, Section, Button, Link } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY = "#6B7280"

type Props = {
  inviteUrl: string
  email: string
}

export default function AdminInvite({ inviteUrl, email }: Props) {
  return (
    <EmailLayout preview="Te invitaron al panel de administración de Novapatch">
      <EmailHeader />

      <Heading style={{ color: NAVY, fontSize: 22, margin: "0 0 8px", fontWeight: 700 }}>
        Te invitaron al equipo de Novapatch
      </Heading>
      <Text style={{ color: "#1a1a1a", fontSize: 15, margin: "0 0 8px" }}>
        Recibiste una invitación para acceder al panel de administración de Novapatch con el
        correo <strong>{email}</strong>.
      </Text>
      <Text style={{ color: GRAY, fontSize: 14, margin: "0 0 24px" }}>
        Haz clic en el botón para crear tu cuenta y aceptar la invitación.
      </Text>

      <Section style={{ textAlign: "center" as const, margin: "8px 0 24px" }}>
        <Button
          href={inviteUrl}
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
          Aceptar invitación
        </Button>
      </Section>

      <Text style={{ color: GRAY, fontSize: 13, margin: "0 0 4px" }}>
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </Text>
      <Link href={inviteUrl} style={{ color: "#17B8A3", fontSize: 13, wordBreak: "break-all" as const }}>
        {inviteUrl}
      </Link>

      <Text style={{ color: GRAY, fontSize: 12, marginTop: 20 }}>
        Esta invitación caduca en 7 días. Si no esperabas este correo, puedes ignorarlo.
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}

AdminInvite.defaultProps = {
  inviteUrl: "https://novabackend-production-7977.up.railway.app/app/invite?token=example",
  email: "nuevo@novapatch.care",
}
