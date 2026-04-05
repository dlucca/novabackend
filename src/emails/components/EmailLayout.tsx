// src/emails/components/EmailLayout.tsx
import {
  Html,
  Head,
  Font,
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
        <Font
          fontFamily="Montserrat"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Montserrat"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/montserrat/v26/JTURjIg1_i6t8kCHKm45_bZF3gnD_g.woff2",
            format: "woff2",
          }}
          fontWeight={600}
          fontStyle="normal"
        />
        <Font
          fontFamily="Montserrat"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/montserrat/v26/JTURjIg1_i6t8kCHKm45_dJE3gnD_g.woff2",
            format: "woff2",
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", margin: 0, padding: "32px 0", fontFamily: "Montserrat, Arial, sans-serif" }}>
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
