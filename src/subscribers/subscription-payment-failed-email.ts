import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendEmail } from "../lib/resend"

type PaymentFailedEventData = {
  subscription_id: string
  reason: string
  error?: string
  customer_email: string
  customer_name: string
  amount?: number
}

export default async function subscriptionPaymentFailedEmailHandler({
  event,
  container,
}: SubscriberArgs<PaymentFailedEventData>) {
  const data = event.data
  const logger = container.resolve("logger")

  try {
    const frontendUrl = process.env.STORE_CORS ?? "https://novapatch.care"

    await sendEmail({
      to: data.customer_email,
      subject: "Novapatch — Problema con tu pago de suscripción",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#dc2626">No pudimos procesar tu pago</h2>
          <p>Hola, ${data.customer_name || "cliente"}.</p>
          <p>Tuvimos un problema al cobrar tu suscripción Novapatch. Tu suscripción quedó pausada temporalmente para que puedas actualizar tu método de pago.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px">
            <p style="margin:0;color:#991b1b;font-size:14px">
              ${data.reason === "no_card" ? "No encontramos una tarjeta registrada en tu cuenta." : "El cargo a tu tarjeta fue rechazado."}
              ${data.error ? `Detalle: ${data.error}` : ""}
            </p>
          </div>
          <p>Para reactivar tu suscripción:</p>
          <ol>
            <li>Ingresa a tu cuenta en <a href="${frontendUrl}">${frontendUrl}</a></li>
            <li>Ve a <strong>Mi cuenta → Suscripciones</strong></li>
            <li>Actualiza tu método de pago</li>
            <li>Reanuda tu suscripción</li>
          </ol>
          <a href="${frontendUrl}/cuenta/suscripciones"
             style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:8px 0">
            Actualizar método de pago
          </a>
          <p>¿Necesitas ayuda? Escríbenos a <a href="mailto:hola@novapatch.care">hola@novapatch.care</a>.</p>
          <p style="color:#6b7280;font-size:13px">Novapatch · Ciudad de México · <a href="https://novapatch.care">novapatch.care</a></p>
        </div>
      `,
    })

    logger.info(
      `[subscription-payment-failed] Email enviado a ${data.customer_email} para suscripción ${data.subscription_id}`
    )
  } catch (err) {
    logger.error(
      `[subscription-payment-failed] Error enviando email para suscripción ${data.subscription_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.payment_failed",
  context: {
    subscriberId: "subscription-payment-failed-email",
  },
}
