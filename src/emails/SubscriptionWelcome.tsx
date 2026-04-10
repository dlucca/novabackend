// src/emails/SubscriptionWelcome.tsx
import { Heading, Text, Link } from "@react-email/components"
import * as React from "react"
import { EmailLayout } from "./components/EmailLayout"
import { EmailHeader } from "./components/EmailHeader"
import { EmailFooter } from "./components/EmailFooter"

type SubscriptionItem = {
  title: string
  interval_days: number
}

type Props = {
  name: string
  orderId: string | number
  subscriptionItems: SubscriptionItem[]
}

function intervalLabel(days: number) {
  if (days === 30) return "mensual"
  if (days === 60) return "bimestral"
  return "trimestral"
}

export default function SubscriptionWelcome({ name, orderId, subscriptionItems }: Props) {
  return (
    <EmailLayout preview="¡Tu suscripción Novapatch está activa!">
      <EmailHeader />

      <Heading style={{ color: "#003D70", fontSize: "22px", margin: "0 0 8px" }}>
        ¡Hola, {name}!
      </Heading>
      <Text style={{ color: "#1a1a1a", margin: "0 0 8px" }}>
        Tu pedido <strong>#{orderId}</strong> fue confirmado y tu suscripción ya está activa.
      </Text>

      <Text style={{ color: "#1a1a1a", fontWeight: 600, margin: "16px 0 8px" }}>
        Productos suscritos:
      </Text>

      {subscriptionItems.map((item, i) => (
        <Text key={i} style={{ color: "#1a1a1a", margin: "4px 0", paddingLeft: "16px" }}>
          · <strong>{item.title}</strong> — suscripción {intervalLabel(item.interval_days)}
        </Text>
      ))}

      <Text style={{ color: "#1a1a1a", marginTop: "20px" }}>
        Te cobraremos automáticamente en la fecha de tu próximo ciclo. Puedes pausar, cancelar o cambiar la frecuencia desde tu cuenta en{" "}
        <Link href="https://novapatch.care/cuenta/suscripciones" style={{ color: "#17B8A3" }}>
          novapatch.care
        </Link>
        .
      </Text>

      <EmailFooter />
    </EmailLayout>
  )
}

SubscriptionWelcome.defaultProps = {
  name: "Ramiro",
  orderId: "1042",
  subscriptionItems: [
    { title: "Parche Energía Novapatch", interval_days: 30 },
  ],
}
