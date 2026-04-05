// src/emails/components/EmailFooter.tsx
import { Text, Link } from "@react-email/components"
import * as React from "react"

export function EmailFooter() {
  return (
    <Text
      style={{
        color: "#6b7280",
        fontSize: "13px",
        marginTop: "32px",
        textAlign: "center" as const,
      }}
    >
      Novapatch · Ciudad de México ·{" "}
      <Link href="https://novapatch.care" style={{ color: "#003D70" }}>
        novapatch.care
      </Link>
    </Text>
  )
}
