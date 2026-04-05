// src/emails/components/EmailHeader.tsx
import { Img, Hr } from "@react-email/components"
import * as React from "react"

const LOGO_URL =
  "https://res.cloudinary.com/dxnoqul2v/image/upload/f_auto,q_auto/logonova_chs6v3"

export function EmailHeader() {
  return (
    <>
      <Img
        src={LOGO_URL}
        alt="Novapatch"
        width={140}
        style={{ display: "block", margin: "0 auto 20px" }}
      />
      <Hr style={{ borderColor: "#17B8A3", borderWidth: "2px", margin: "0 0 24px" }} />
    </>
  )
}
