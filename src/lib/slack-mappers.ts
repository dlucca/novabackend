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

function formatTotal(total: number, currencyCode: string): string {
  const amount = Number(total ?? 0) / 100
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
      currencyDisplay: "code",
    }).format(amount)
  } catch {
    return `${currencyCode.toUpperCase()} ${amount.toFixed(2)}`
  }
}

export function mapOrderToSlackBlocks(order: any): SlackBlock[] {
  const displayId = order.display_id ? `#${order.display_id}` : order.id

  const addr = order.shipping_address
  const firstName = addr?.first_name ?? ""
  const lastName = addr?.last_name ?? ""
  const clienteName = (firstName + " " + lastName).trim() || "(sin nombre)"

  const email = order.email || "(sin email)"

  const city = addr?.city ?? ""
  const province = addr?.province ?? ""
  const country = addr?.country_code?.toUpperCase() ?? ""
  const locationParts = [city, province].filter(Boolean)
  const location =
    locationParts.length > 0
      ? `${locationParts.join(", ")} · ${country}`
      : country || "(sin ubicación)"

  const items = (order.items ?? []).filter(
    (item: any) => !item.metadata?.is_shipping && !item.is_shipping_cost
  )

  const productsList =
    items.map((item: any) => `• ${item.title} x${item.quantity}`).join("\n") || "—"

  const total = formatTotal(order.total ?? 0, order.currency_code ?? "mxn")
  const date = formatDate(order.created_at)

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🛍️ Nueva orden recibida", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Orden*\n${displayId}` },
        { type: "mrkdwn", text: `*Fecha*\n${date}` },
        { type: "mrkdwn", text: `*Cliente*\n${clienteName}` },
        { type: "mrkdwn", text: `*Email*\n${email}` },
        { type: "mrkdwn", text: `*Ubicación*\n${location}` },
        { type: "mrkdwn", text: `*Items*\n${items.length}` },
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
      text: { type: "mrkdwn", text: `*Total*   ${total}` },
    },
  ]
}
