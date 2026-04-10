import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import OrderConfirmation from "../emails/OrderConfirmation"

export default async function orderConfirmationEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  try {
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    }) as any

    if (!order) return

    const email = order.email
    if (!email) {
      logger.warn(`[order-confirmation] No email for order ${orderId}`)
      return
    }

    const name = order.shipping_address?.first_name ?? "Cliente"
    const displayId = order.display_id ?? orderId

    const html = await renderEmail(
      React.createElement(OrderConfirmation, {
        name,
        displayId,
        items: (order.items ?? []).map((item: any) => ({
          title: item.title ?? "",
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price ?? 0,
          metadata: item.metadata,
        })),
        shippingAddress: order.shipping_address ?? null,
        currencyCode: order.currency_code ?? "mxn",
      })
    )

    await sendEmail({
      to: email,
      subject: `Pedido #${displayId} confirmado — Novapatch`,
      html,
    })

    logger.info(`[order-confirmation] Email enviado a ${email} para orden #${displayId}`)
  } catch (err) {
    logger.error(
      `[order-confirmation] Error enviando email para orden ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "order-confirmation-email",
  },
}
