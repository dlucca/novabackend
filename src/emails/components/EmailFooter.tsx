// src/emails/components/EmailFooter.tsx
import { Text, Link, Hr } from "@react-email/components"
import * as React from "react"

export function EmailFooter() {
  return (
    <>
      <Hr style={{ borderColor: "#E6E1D8", margin: "32px 0 20px" }} />
      <Text
        style={{
          color: "#A8A29A",
          fontSize: "12px",
          margin: "0 0 8px",
          textAlign: "center" as const,
          fontStyle: "italic",
        }}
      >
        bienestar que no interrumpe tu día.
      </Text>
      <Text
        style={{
          color: "#3A3A37",
          fontSize: "12px",
          margin: "0 0 4px",
          textAlign: "center" as const,
        }}
      >
        Novapatch Care · Ciudad de México ·{" "}
        <Link href="https://www.novapatch.care/mx" style={{ color: "#0F0F0F", fontWeight: 600, textDecoration: "underline" }}>
          novapatch.care/mx
        </Link>
      </Text>
      <Text
        style={{
          color: "#A8A29A",
          fontSize: "11px",
          margin: 0,
          textAlign: "center" as const,
        }}
      >
        © {new Date().getFullYear()} Novapatch Inc. Todos los derechos reservados.
      </Text>
    </>
  )
}
