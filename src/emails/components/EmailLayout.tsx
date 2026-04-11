// src/emails/components/EmailLayout.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
} from "@react-email/components"
import * as React from "react"

type Props = {
  preview: string
  children: React.ReactNode
}

export function EmailLayout({ preview, children }: Props) {
  return (
    <Html lang="es">
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", margin: 0, padding: "32px 0", fontFamily: "Outfit, Arial, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            maxWidth: "600px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  )
}
