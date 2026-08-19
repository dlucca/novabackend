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
    <Html lang="es-MX">
      <Head>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap');
          body { -webkit-font-smoothing: antialiased; }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#FAF8F5", margin: 0, padding: "32px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Roboto, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "20px",
            border: "1px solid #E6E1D8",
            maxWidth: "580px",
            margin: "0 auto",
            padding: "32px 36px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.03)",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  )
}
