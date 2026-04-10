import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import SubscriptionPaymentFailed from "../emails/SubscriptionPaymentFailed"

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

    const html = await renderEmail(
      React.createElement(SubscriptionPaymentFailed, {
        customerName: data.customer_name,
        reason: data.reason,
        error: data.error,
        frontendUrl,
      })
    )

    await sendEmail({
      to: data.customer_email,
      subject: "Novapatch — Problema con tu pago de suscripción",
      html,
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
