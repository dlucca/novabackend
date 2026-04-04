import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendEmail } from "../lib/resend"

/**
 * Sends an order confirmation email for ALL orders (one-time and subscription).
 * The subscription-welcome-email subscriber handles the subscription-specific message separately.
 */
export default async function orderConfirmationEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: [
        "id",
        "display_id",
        "email",
        "total",
        "currency_code",
        "items.id",
        "items.title",
        "items.quantity",
        "items.unit_price",
        "items.metadata",
        "shipping_address.address_1",
        "shipping_address.address_2",
        "shipping_address.city",
        "shipping_address.province",
        "shipping_address.postal_code",
        "shipping_address.first_name",
        "shipping_address.last_name",
      ],
    })

    const order = orders[0] as any
    if (!order) return

    const email = order.email
    if (!email) {
      logger.warn(`[order-confirmation] No email for order ${orderId}`)
      return
    }

    const name = order.shipping_address?.first_name ?? "Cliente"
    const displayId = order.display_id ?? orderId

    // Format currency
    const fmt = (n: number) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: (order.currency_code ?? "mxn").toUpperCase(),
        minimumFractionDigits: 0,
      }).format(n)

    // Build items list
    const itemsHtml = (order.items ?? [])
      .map((item: any) => {
        const isSub = item.metadata?.is_subscription === true
        const badge = isSub ? " 🔄 Suscripción" : ""
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">${item.title}${badge}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${fmt(item.unit_price * item.quantity)}</td>
        </tr>`
      })
      .join("")

    // Build address
    const addr = order.shipping_address
    const addressHtml = addr
      ? `${addr.address_1 ?? ""}${addr.address_2 ? `, ${addr.address_2}` : ""}<br>
         ${addr.city ?? ""}, ${addr.province ?? ""} ${addr.postal_code ?? ""}`
      : "No disponible"

    await sendEmail({
      to: email,
      subject: `Pedido #${displayId} confirmado — Novapatch`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#005088">¡Gracias por tu compra, ${name}!</h2>
          <p>Tu pedido <strong>#${displayId}</strong> ha sido confirmado.</p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <thead>
              <tr style="border-bottom:2px solid #005088">
                <th style="text-align:left;padding:8px 0">Producto</th>
                <th style="text-align:center;padding:8px 0">Cant.</th>
                <th style="text-align:right;padding:8px 0">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding:12px 0;font-weight:bold;text-align:right">Total:</td>
                <td style="padding:12px 0;font-weight:bold;text-align:right;color:#005088">${fmt(order.total)}</td>
              </tr>
            </tfoot>
          </table>

          <h3 style="color:#005088;margin-top:24px">Dirección de envío</h3>
          <p>${addressHtml}</p>

          <p style="margin-top:24px">Te notificaremos cuando tu pedido sea enviado.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:32px">Novapatch · Ciudad de México · <a href="https://novapatch.care" style="color:#005088">novapatch.care</a></p>
        </div>
      `,
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
