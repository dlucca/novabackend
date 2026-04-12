// src/emails/components/EmailFooter.tsx
import { Text, Link, Hr } from "@react-email/components"
import * as React from "react"

export function EmailFooter() {
  return (
    <>
      <Hr style={{ borderColor: "#E5E7EB", margin: "32px 0 20px" }} />
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: "12px",
          margin: "0 0 6px",
          textAlign: "center" as const,
          fontStyle: "italic",
        }}
      >
        bienestar que no interrumpe tu día
      </Text>
      <Text
        style={{
          color: "#6B7280",
          fontSize: "13px",
          margin: "0 0 6px",
          textAlign: "center" as const,
        }}
      >
        Novapatch · Ciudad de México ·{" "}
        <Link href="https://novapatch.care" style={{ color: "#003D70" }}>
          novapatch.care
        </Link>
      </Text>
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: "11px",
          margin: 0,
          textAlign: "center" as const,
        }}
      >
        © 2025 Novapatch. Todos los derechos reservados.
      </Text>
    </>
  )
}
