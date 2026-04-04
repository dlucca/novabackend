import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendEmail } from "../lib/resend"

type RenewedEventData = {
  subscription_id: string
  order_id: string
  cycle_number: number
  amount: number
  currency_code: string
  customer_email: string
  customer_name: string
  next_billing_date: string
  openpay_charge_id: string
}

export default async function subscriptionRenewedEmailHandler({
  event,
  container,
}: SubscriberArgs<RenewedEventData>) {
  const data = event.data
  const logger = container.resolve("logger")

  try {
    const formattedAmount = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: data.currency_code.toUpperCase(),
    }).format(data.amount)

    const formattedDate = new Intl.DateTimeFormat("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Mexico_City",
    }).format(new Date(data.next_billing_date))

    await sendEmail({
      to: data.customer_email,
      subject: `Novapatch — Cargo realizado: ${formattedAmount}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#7c3aed">Tu suscripción fue renovada</h2>
          <p>Hola, ${data.customer_name || "cliente"}.</p>
          <p>Realizamos el cargo de <strong>${formattedAmount}</strong> a tu tarjeta registrada.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr>
              <td style="padding:8px 0;color:#6b7280">Ciclo</td>
              <td style="padding:8px 0;text-align:right">${data.cycle_number}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280">Monto cobrado</td>
              <td style="padding:8px 0;text-align:right">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280">Referencia Openpay</td>
              <td style="padding:8px 0;text-align:right;font-size:12px">${data.openpay_charge_id}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280">Próximo cargo</td>
              <td style="padding:8px 0;text-align:right">${formattedDate}</td>
            </tr>
          </table>
          <p>¿Tienes alguna duda? Escríbenos a <a href="mailto:hola@novapatch.mx">hola@novapatch.mx</a>.</p>
          <p style="color:#6b7280;font-size:13px">Novapatch · Ciudad de México · <a href="https://novapatch.mx">novapatch.mx</a></p>
        </div>
      `,
    })

    logger.info(
      `[subscription-renewed] Email enviado a ${data.customer_email} para suscripción ${data.subscription_id}`
    )
  } catch (err) {
    logger.error(
      `[subscription-renewed] Error enviando email para suscripción ${data.subscription_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.renewed",
  context: {
    subscriberId: "subscription-renewed-email",
  },
}
