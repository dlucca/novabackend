// src/emails/CartRecovery.tsx
import { Heading, Text, Button, Section } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type Props = {
  recoveryUrl: string
}

export default function CartRecovery({ recoveryUrl }: Props) {
  return (
    <EmailLayout preview="Tus parches Novapatch te están esperando">
      <EmailHeader />

      <Heading
        style={{
          color: "#003D70",
          fontSize: "22px",
          margin: "0 0 16px",
          lineHeight: "1.3",
        }}
      >
        Hola,
      </Heading>

      <Text style={{ color: "#1a1a1a", margin: "0 0 12px", lineHeight: "1.6" }}>
        Vimos que estuviste viendo Novapatch y dejaste algunas cosas en tu carrito.
      </Text>

      <Text style={{ color: "#1a1a1a", margin: "0 0 12px", lineHeight: "1.6" }}>
        Sabemos que a veces no es el momento… pero si estabas pensando en
        probarlos, los dejamos listos para vos.
      </Text>

      <Text style={{ color: "#1a1a1a", margin: "0 0 24px", lineHeight: "1.6" }}>
        Pequeños cambios en la rutina pueden hacer una diferencia real — sobre
        todo cuando se trata de energía, foco o desconectar.
      </Text>

      <Section style={{ textAlign: "center", margin: "32px 0" }}>
        <Button
          href={recoveryUrl}
          style={{
            backgroundColor: "#17B8A3",
            color: "#ffffff",
            padding: "14px 32px",
            borderRadius: "6px",
            fontSize: "15px",
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Volver a mi carrito
        </Button>
      </Section>

      <EmailFooter />
    </EmailLayout>
  )
}

CartRecovery.defaultProps = {
  recoveryUrl: "https://novapatch.care/cart-recovery?id=cart_01TEST",
}
