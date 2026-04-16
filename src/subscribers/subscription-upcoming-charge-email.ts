import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import SubscriptionUpcomingCharge from "../emails/SubscriptionUpcomingCharge"

type UpcomingChargeEventData = {
  subscription_id: string
  customer_email: string
  customer_name: string
  next_billing_date: string
  product_title: string
  interval_days: number
}

export default async function subscriptionUpcomingChargeEmailHandler({
  event,
  container,
}: SubscriberArgs<UpcomingChargeEventData>) {
  const data = event.data
  const logger = container.resolve("logger")

  try {
    const html = await renderEmail(
      React.createElement(SubscriptionUpcomingCharge, {
        customerName: data.customer_name,
        productTitle: data.product_title,
        nextBillingDate: data.next_billing_date,
        interval_days: data.interval_days,
      })
    )

    await sendEmail({
      to: data.customer_email,
      subject: "Novapatch — Tu suscripción se renueva en 3 días",
      html,
    })

    logger.info(
      `[subscription-upcoming-charge] Email enviado a ${data.customer_email} para suscripción ${data.subscription_id}`
    )
  } catch (err) {
    logger.error(
      `[subscription-upcoming-charge] Error enviando email para suscripción ${data.subscription_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "subscription.upcoming_charge",
  context: {
    subscriberId: "subscription-upcoming-charge-email",
  },
}
