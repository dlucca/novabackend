// src/emails/components/EmailHeader.tsx
import { Img } from "@react-email/components"
import * as React from "react"

const HERO_BANNER_URL = "https://www.novapatch.care/carousel/Email_hero.jpg"

export function EmailHeader() {
  return (
    <Img
      src={HERO_BANNER_URL}
      alt="Novapatch Bienestar Silencioso"
      width={508}
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        borderRadius: "16px",
        marginBottom: "28px",
      }}
    />
  )
}
