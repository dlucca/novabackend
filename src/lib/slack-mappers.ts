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
    return new Date(dateStr).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return dateStr ?? ""
  }
}

export function mapInfluencerApplicationToSlackBlocks(app: {
  nombre: string
  email: string
  pais: string
  // Legacy single-network fields (older applications)
  red_principal?: string | null
  handle?: string | null
  // New per-network fields (current form)
  instagram_handle?: string | null
  tiktok_handle?: string | null
  rango_seguidores: string
  nicho: string[]
  parches: string[]
}): SlackBlock[] {
  // Build a "Redes" line that handles both shapes:
  // - new form: "IG: @x · TT: @y"
  // - legacy:   "instagram — @x"
  const redesParts: string[] = []
  if (app.instagram_handle) redesParts.push(`IG: @${app.instagram_handle}`)
  if (app.tiktok_handle) redesParts.push(`TT: @${app.tiktok_handle}`)
  const redesText =
    redesParts.length > 0
      ? redesParts.join(" · ")
      : app.red_principal && app.handle
      ? `${app.red_principal} — @${app.handle}`
      : "—"

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
        { type: "mrkdwn", text: `*Redes*\n${redesText}` },
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

export type RailwayDeploymentStatus = "SUCCESS" | "FAILED" | "CRASHED" | string

export type RailwayWebhookPayload = {
  type: string
  timestamp?: string
  project?: { id: string; name: string }
  environment?: { id: string; name: string }
  service?: { id: string; name: string }
  deployment?: {
    id: string
    status: RailwayDeploymentStatus
    url?: string
    meta?: {
      commitMessage?: string
      commitAuthor?: string
      branch?: string
      repo?: string
    }
  }
}

export function mapRailwayEventToSlackBlocks(payload: RailwayWebhookPayload): SlackBlock[] | null {
  const type = payload.type
  const service = payload.service?.name ?? "backend"
  const env = payload.environment?.name ?? "production"
  const meta = payload.deployment?.meta

  if (type === "DEPLOYMENT_DEPLOYED") {
    const commit = meta?.commitMessage ? `\`${meta.commitMessage}\`` : "—"
    return [
      {
        type: "header",
        text: { type: "plain_text", text: `🟢 Deploy exitoso — ${service}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Entorno*\n${env}` },
          { type: "mrkdwn", text: `*Commit*\n${commit}` },
          ...(meta?.branch ? [{ type: "mrkdwn" as const, text: `*Rama*\n${meta.branch}` }] : []),
        ],
      },
    ]
  }

  if (type === "DEPLOYMENT_CRASHED") {
    const commit = meta?.commitMessage ? `\`${meta.commitMessage}\`` : "—"
    return [
      {
        type: "header",
        text: { type: "plain_text", text: `🔴 Servicio CAÍDO — ${service}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Entorno*\n${env}` },
          { type: "mrkdwn", text: `*Commit*\n${commit}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "⚠️ El servicio se reinició inesperadamente. Revisar logs en Railway." },
      },
    ]
  }

  if (type === "DEPLOYMENT_OOM_KILLED") {
    return [
      {
        type: "header",
        text: { type: "plain_text", text: `🔴 Out of Memory — ${service}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Entorno*\n${env}` },
          { type: "mrkdwn", text: `*Deployment ID*\n\`${payload.deployment?.id ?? "—"}\`` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "El proceso fue terminado por exceso de memoria. Considera aumentar el límite en Railway." },
      },
    ]
  }

  if (type === "MONITOR_TRIGGERED") {
    return [
      {
        type: "header",
        text: { type: "plain_text", text: `🟡 Monitor activado — ${service}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Entorno*\n${env}` },
          { type: "mrkdwn", text: `*Proyecto*\n${payload.project?.name ?? "—"}` },
        ],
      },
    ]
  }

  if (type === "VOLUME_ALERT_TRIGGERED") {
    return [
      {
        type: "header",
        text: { type: "plain_text", text: `🟡 Alerta de volumen — ${service}`, emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "El almacenamiento del volumen está llegando al límite. Revisar en Railway." },
      },
    ]
  }

  // Ignorar eventos de estado intermedio
  return null
}

export function mapBillingRunToSlackBlocks(stats: {
  succeeded: number
  failed: number
  skipped: number
  total: number
  date: string
}): SlackBlock[] {
  const { succeeded, failed, skipped, total, date } = stats
  const hasFailures = failed > 0
  const emoji = hasFailures ? "🟡" : "🟢"
  const title = `${emoji} Billing Run — ${date}`

  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Total due*\n${total}` },
        { type: "mrkdwn", text: `*Cobradas*\n${succeeded}` },
        { type: "mrkdwn", text: `*Fallidas*\n${failed}` },
        { type: "mrkdwn", text: `*Diferidas*\n${skipped}` },
      ],
    },
  ]

  if (hasFailures) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⚠️ ${failed} suscripción${failed > 1 ? "es" : ""} pasó a *past_due* — revisar en admin.`,
      },
    })
  }

  return blocks
}

export function mapBillingCriticalErrorToSlackBlocks(error: string): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🔴 CRÍTICO — Billing job falló", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Error:*\n\`\`\`${error}\`\`\`` },
    },
  ]
}

export function mapPaymentFailedAlertToSlackBlocks(data: {
  subscription_id: string
  reason: string
  customer_email: string
  customer_name: string
  amount?: number
}): SlackBlock[] {
  const amountText = data.amount != null ? `$${data.amount} MXN` : "—"
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🟡 Pago fallido en suscripción", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Suscripción*\n\`${data.subscription_id}\`` },
        { type: "mrkdwn", text: `*Razón*\n${data.reason}` },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Cliente*\n${data.customer_name || "—"} · ${data.customer_email}` },
        { type: "mrkdwn", text: `*Monto*\n${amountText}` },
      ],
    },
  ]
}

export function mapSubscriptionCanceledToSlackBlocks(data: {
  subscription_id: string
  previous_status: string
  customer_email?: string
  interval_days?: number
}): SlackBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "📊 Suscripción cancelada", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Suscripción*\n\`${data.subscription_id}\`` },
        { type: "mrkdwn", text: `*Estado anterior*\n${data.previous_status}` },
        ...(data.customer_email
          ? [{ type: "mrkdwn" as const, text: `*Cliente*\n${data.customer_email}` }]
          : []),
        ...(data.interval_days != null
          ? [{ type: "mrkdwn" as const, text: `*Frecuencia*\nCada ${data.interval_days} días` }]
          : []),
      ],
    },
  ]
}

export function mapPaymentCapturedToSlackBlocks(order: any): SlackBlock[] {
  const displayId = order.display_id ? `#${order.display_id}` : order.id
  const date = formatDate(order.created_at)
  const currency = (order.currency_code ?? "mxn").toUpperCase()
  const total =
    typeof order.total === "number"
      ? new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: currency === "MXN" ? "MXN" : currency,
        }).format(order.total)
      : `${order.total} ${currency}`

  const customerName =
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") ||
    order.shipping_address?.first_name ||
    "—"
  const email = order.email ?? order.customer?.email ?? "—"

  const items = (order.items ?? []).filter(
    (item: any) => !item.metadata?.is_shipping && !item.is_shipping_cost
  )
  const productsList =
    items
      .map((item: any) => {
        const sub = item.metadata?.is_subscription
          ? ` _(suscripción ${item.metadata.interval_days}d)_`
          : ""
        return `• ${item.title} x${item.quantity}${sub}`
      })
      .join("\n") || "—"

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "💳 Cobro confirmado", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Orden*\n${displayId}` },
        { type: "mrkdwn", text: `*Total*\n${total}` },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Cliente*\n${customerName}` },
        { type: "mrkdwn", text: `*Email*\n${email}` },
      ],
    },
    {
      type: "section",
      fields: [{ type: "mrkdwn", text: `*Fecha*\n${date}` }],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Productos*\n${productsList}` },
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
