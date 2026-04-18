// src/lib/slack-mappers.ts

export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string; emoji: boolean } }
  | { type: "divider" }
  | {
      type: "section"
      text?: { type: "mrkdwn"; text: string }
      fields?: Array<{ type: "mrkdwn"; text: string }>
    }

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateStr ?? ""
  }
}

export function mapInfluencerApplicationToSlackBlocks(app: {
  nombre: string
  email: string
  pais: string
  red_principal: string
  handle: string
  rango_seguidores: string
  nicho: string[]
  parches: string[]
}): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🌟 Nueva postulación de influencer", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Nombre*\n${app.nombre}` },
        { type: "mrkdwn", text: `*Email*\n${app.email}` },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Red principal*\n${app.red_principal} — @${app.handle}` },
        { type: "mrkdwn", text: `*Seguidores*\n${app.rango_seguidores}` },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*País*\n${app.pais}` },
        { type: "mrkdwn", text: `*Nicho*\n${app.nicho.join(", ")}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Parches de interés*\n${app.parches.join(", ")}` },
    },
  ]
}

export function mapFulfillmentToSlackBlocks(order: any, labelUrl: string): SlackBlock[] {
  const displayId = order.display_id ? `#${order.display_id}` : order.id
  const date = formatDate(order.created_at)

  const items = (order.items ?? []).filter(
    (item: any) => !item.metadata?.is_shipping && !item.is_shipping_cost
  )
  const productsList =
    items.map((item: any) => `• ${item.title} x${item.quantity}`).join("\n") || "—"

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🚚 Orden lista para envío", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Orden*\n${displayId}` },
        { type: "mrkdwn", text: `*Fecha*\n${date}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Productos*\n${productsList}` },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Etiqueta*   <${labelUrl}|Ver etiqueta PDF>` },
    },
  ]
}
