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
