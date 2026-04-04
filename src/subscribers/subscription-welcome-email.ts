import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { sendEmail } from "../lib/resend"

// Sends a welcome email when an order containing subscription items is placed.
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
    })

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

    const intervalLabel = (days: number) =>
      days === 30 ? "mensual" : days === 60 ? "bimestral" : "trimestral"

    const itemsList = subscriptionItems
      .map((item: any) => {
        const interval = Number(item.metadata?.interval_days ?? 30)
        return `<li><strong>${item.title}</strong> — suscripción ${intervalLabel(interval)}</li>`
      })
      .join("")

    await sendEmail({
      to: email,
      subject: "¡Bienvenido a Novapatch! Tu suscripción está activa",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#7c3aed">¡Hola, ${name}!</h2>
          <p>Tu pedido <strong>#${order.display_id ?? orderId}</strong> fue confirmado y tu suscripción ya está activa.</p>
          <p>Productos suscritos:</p>
          <ul>${itemsList}</ul>
          <p>Te cobraremos automáticamente en la fecha de tu próximo ciclo. Puedes pausar, cancelar o cambiar la frecuencia desde tu cuenta.</p>
          <p style="color:#6b7280;font-size:13px">Novapatch · Ciudad de México · <a href="https://novapatch.care">novapatch.care</a></p>
        </div>
      `,
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
