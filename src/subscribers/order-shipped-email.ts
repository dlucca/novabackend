// src/subscribers/order-shipped-email.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import OrderShipped from "../emails/OrderShipped"

export default async function orderShippedEmailHandler({
  event,
  container,
}: SubscriberArgs<{ order_id: string; fulfillment_id: string }>) {
  const orderId = event.data.order_id
  const fulfillmentId = event.data.fulfillment_id
  const logger = container.resolve("logger")

  try {
    const orderService = container.resolve(Modules.ORDER)
    const fulfillmentService = container.resolve(Modules.FULFILLMENT)

    const order = await orderService.retrieveOrder(orderId, {
      relations: ["shipping_address"],
    }) as any

    if (!order?.email) {
      logger.warn(`[order-shipped] No email for order ${orderId}`)
      return
    }

    // Retrieve the specific fulfillment from the event
    const fulfillment = await fulfillmentService.retrieveFulfillment(
      fulfillmentId,
      { relations: ["labels"] }
    ) as any

    if (!fulfillment) {
      logger.warn(`[order-shipped] Fulfillment not found: ${fulfillmentId}`)
      return
    }

    const label = fulfillment.labels?.[0]

    if (!label?.tracking_number) {
      logger.warn(`[order-shipped] No tracking label for fulfillment ${fulfillmentId}`)
      return
    }

    const name = order.shipping_address?.first_name ?? "Cliente"
    const displayId = order.display_id ?? orderId
    const carrier = fulfillment.metadata?.carrier ?? "carrier"

    const html = await renderEmail(
      React.createElement(OrderShipped, {
        name,
        displayId,
        trackingNumber: label.tracking_number,
        trackingUrl: label.tracking_url ?? `https://novapatch.care/rastreo/${label.tracking_number}`,
        carrier,
      })
    )

    await sendEmail({
      to: order.email,
      subject: `Tu pedido #${displayId} está en camino — Novapatch`,
      html,
    })

    logger.info(`[order-shipped] Email enviado a ${order.email} para orden #${displayId}`)
  } catch (err) {
    logger.error(
      `[order-shipped] Error enviando email para orden ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
  context: {
    subscriberId: "order-shipped-email",
  },
}
