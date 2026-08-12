import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import AdminInvite from "../emails/AdminInvite"

export default async function adminInviteEmailHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const inviteId = event.data.id
  const logger = container.resolve("logger")

  try {
    const query = container.resolve("query")

    const {
      data: [invite],
    } = await query.graph({
      entity: "invite",
      fields: ["email", "token"],
      filters: { id: inviteId },
    })

    if (!invite?.email || !invite?.token) {
      logger.warn(`[admin-invite] Invitación ${inviteId} sin email o token — no se envía correo`)
      return
    }

    const config = container.resolve("configModule")
    const adminPath = config.admin?.path ?? "/app"
    // El admin corre por separado del backend (DISABLE_ADMIN=true en producción),
    // así que la URL base del panel debe ser configurable. Fallback: backendUrl del
    // config y, en último caso, localhost.
    const configuredBackendUrl =
      config.admin?.backendUrl && config.admin.backendUrl !== "/"
        ? config.admin.backendUrl
        : undefined
    const baseUrl = (
      process.env.MEDUSA_ADMIN_URL ??
      configuredBackendUrl ??
      "http://localhost:9000"
    ).replace(/\/$/, "")

    const inviteUrl = `${baseUrl}${adminPath}/invite?token=${invite.token}`

    const html = await renderEmail(
      React.createElement(AdminInvite, {
        inviteUrl,
        email: invite.email,
      })
    )

    await sendEmail({
      to: invite.email,
      subject: "Te invitaron al panel de administración de Novapatch",
      html,
    })

    logger.info(`[admin-invite] Email de invitación enviado a ${invite.email}`)
  } catch (err) {
    logger.error(
      `[admin-invite] Error enviando invitación ${inviteId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: ["invite.created", "invite.resent"],
  context: {
    subscriberId: "admin-invite-email",
  },
}
