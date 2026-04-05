import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import { SubscriptionRenewed } from "../emails/SubscriptionRenewed"

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

    const html = await renderEmail(
      React.createElement(SubscriptionRenewed, {
        customerName: data.customer_name,
        amount: data.amount,
        currencyCode: data.currency_code,
        cycleNumber: data.cycle_number,
        nextBillingDate: data.next_billing_date,
        openpayChargeId: data.openpay_charge_id,
      })
    )

    await sendEmail({
      to: data.customer_email,
      subject: `Novapatch — Cargo realizado: ${formattedAmount}`,
      html,
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
