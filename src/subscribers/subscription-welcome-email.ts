import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import SubscriptionWelcome from "../emails/SubscriptionWelcome"

export default async function subscriptionWelcomeEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items"],
    }) as any

    const subscriptionItems = (order.items ?? []).filter(
      (item: any) => item.metadata?.is_subscription === true
    )

    if (subscriptionItems.length === 0) return

    const customerService = container.resolve(Modules.CUSTOMER)
    const customers = order.customer_id
      ? await customerService.listCustomers({ id: order.customer_id })
      : []
    const customer = customers[0]
    const email = customer?.email ?? order.email
    const name = customer?.first_name ?? "Cliente"

    if (!email) return

    const html = await renderEmail(
      React.createElement(SubscriptionWelcome, {
        name,
        orderId: order.display_id ?? orderId,
        subscriptionItems: subscriptionItems.map((item: any) => ({
          title: item.title ?? "",
          interval_days: Number(item.metadata?.interval_days ?? 30),
        })),
      })
    )

    await sendEmail({
      to: email,
      subject: "¡Bienvenido a Novapatch! Tu suscripción está activa",
      html,
    })

    logger.info(`[subscription-welcome] Email enviado a ${email} para orden ${orderId}`)
  } catch (err) {
    logger.error(
      `[subscription-welcome] Error enviando email para orden ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "subscription-welcome-email",
  },
}
