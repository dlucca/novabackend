// src/lib/telegram-mappers.ts
//
// Builds Telegram message strings (HTML parse mode) for each notification
// type. Replaces the old Slack block mappers. Any user-provided value is run
// through esc() so it can't break the HTML markup.

/** HTML-escape a value for Telegram's HTML parse mode. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
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

export function mapInfluencerApplicationToTelegramMessage(app: {
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
}): string {
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
    "🌟 <b>Nueva postulación de influencer</b>",
    "",
    `<b>Nombre:</b> ${esc(app.nombre)}`,
    `<b>Email:</b> ${esc(app.email)}`,
    `<b>Redes:</b> ${esc(redesText)}`,
    `<b>Seguidores:</b> ${esc(app.rango_seguidores)}`,
    `<b>País:</b> ${esc(app.pais)}`,
    `<b>Nicho:</b> ${esc(app.nicho.join(", "))}`,
    "",
    `<b>Parches de interés:</b> ${esc(app.parches.join(", "))}`,
  ].join("\n")
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

export function mapRailwayEventToTelegramMessage(
  payload: RailwayWebhookPayload
): string | null {
  const type = payload.type
  const service = esc(payload.service?.name ?? "backend")
  const env = esc(payload.environment?.name ?? "production")
  const meta = payload.deployment?.meta

  if (type === "DEPLOYMENT_DEPLOYED") {
    const commit = meta?.commitMessage ? `<code>${esc(meta.commitMessage)}</code>` : "—"
    return [
      `🟢 <b>Deploy exitoso — ${service}</b>`,
      "",
      `<b>Entorno:</b> ${env}`,
      `<b>Commit:</b> ${commit}`,
      ...(meta?.branch ? [`<b>Rama:</b> ${esc(meta.branch)}`] : []),
    ].join("\n")
  }

  if (type === "DEPLOYMENT_CRASHED") {
    const commit = meta?.commitMessage ? `<code>${esc(meta.commitMessage)}</code>` : "—"
    return [
      `🔴 <b>Servicio CAÍDO — ${service}</b>`,
      "",
      `<b>Entorno:</b> ${env}`,
      `<b>Commit:</b> ${commit}`,
      "",
      "⚠️ El servicio se reinició inesperadamente. Revisar logs en Railway.",
    ].join("\n")
  }

  if (type === "DEPLOYMENT_OOM_KILLED") {
    return [
      `🔴 <b>Out of Memory — ${service}</b>`,
      "",
      `<b>Entorno:</b> ${env}`,
      `<b>Deployment ID:</b> <code>${esc(payload.deployment?.id ?? "—")}</code>`,
      "",
      "El proceso fue terminado por exceso de memoria. Considera aumentar el límite en Railway.",
    ].join("\n")
  }

  if (type === "MONITOR_TRIGGERED") {
    return [
      `🟡 <b>Monitor activado — ${service}</b>`,
      "",
      `<b>Entorno:</b> ${env}`,
      `<b>Proyecto:</b> ${esc(payload.project?.name ?? "—")}`,
    ].join("\n")
  }

  if (type === "VOLUME_ALERT_TRIGGERED") {
    return [
      `🟡 <b>Alerta de volumen — ${service}</b>`,
      "",
      "El almacenamiento del volumen está llegando al límite. Revisar en Railway.",
    ].join("\n")
  }

  // Ignorar eventos de estado intermedio
  return null
}

export function mapBillingRunToTelegramMessage(stats: {
  succeeded: number
  failed: number
  skipped: number
  total: number
  date: string
}): string {
  const { succeeded, failed, skipped, total, date } = stats
  const hasFailures = failed > 0
  const emoji = hasFailures ? "🟡" : "🟢"

  const lines = [
    `${emoji} <b>Billing Run — ${esc(date)}</b>`,
    "",
    `<b>Total due:</b> ${total}`,
    `<b>Cobradas:</b> ${succeeded}`,
    `<b>Fallidas:</b> ${failed}`,
    `<b>Diferidas:</b> ${skipped}`,
  ]

  if (hasFailures) {
    lines.push(
      "",
      `⚠️ ${failed} suscripción${failed > 1 ? "es" : ""} pasó a <b>past_due</b> — revisar en admin.`
    )
  }

  return lines.join("\n")
}

export function mapBillingCriticalErrorToTelegramMessage(error: string): string {
  return [
    "🔴 <b>CRÍTICO — Billing job falló</b>",
    "",
    "<b>Error:</b>",
    `<pre>${esc(error)}</pre>`,
  ].join("\n")
}

export function mapBillingPausedToTelegramMessage(): string {
  return [
    "⏸️ <b>Cron de cobros PAUSADO</b>",
    "",
    "El cron diario de cobros recurrentes corrió pero no procesó nada porque " +
      "<code>BILLING_CRON_PAUSED=true</code> está activo. Quita la variable en Railway para reanudar.",
  ].join("\n")
}

export function mapPaymentFailedAlertToTelegramMessage(data: {
  subscription_id: string
  reason: string
  customer_email: string
  customer_name: string
  amount?: number
}): string {
  const amountText = data.amount != null ? `$${data.amount} MXN` : "—"
  return [
    "🟡 <b>Pago fallido en suscripción</b>",
    "",
    `<b>Suscripción:</b> <code>${esc(data.subscription_id)}</code>`,
    `<b>Razón:</b> ${esc(data.reason)}`,
    `<b>Cliente:</b> ${esc(data.customer_name || "—")} · ${esc(data.customer_email)}`,
    `<b>Monto:</b> ${esc(amountText)}`,
  ].join("\n")
}

export function mapSubscriptionCanceledToTelegramMessage(data: {
  subscription_id: string
  previous_status: string
  customer_email?: string
  interval_days?: number
}): string {
  const lines = [
    "📊 <b>Suscripción cancelada</b>",
    "",
    `<b>Suscripción:</b> <code>${esc(data.subscription_id)}</code>`,
    `<b>Estado anterior:</b> ${esc(data.previous_status)}`,
  ]
  if (data.customer_email) lines.push(`<b>Cliente:</b> ${esc(data.customer_email)}`)
  if (data.interval_days != null)
    lines.push(`<b>Frecuencia:</b> Cada ${data.interval_days} días`)
  return lines.join("\n")
}

export function mapPaymentCapturedToTelegramMessage(order: any): string {
  const displayId = order.display_id ? `#${order.display_id}` : order.id
  const date = formatDate(order.created_at)
  const currency = (order.currency_code ?? "mxn").toUpperCase()

  // Calculate order total correctly in Medusa V2
  let numericTotal = 0
  if (typeof order.total === "number") {
    numericTotal = order.total
  } else if (typeof order.total === "string") {
    numericTotal = parseFloat(order.total)
  } else if (order.total?.numeric != null) {
    numericTotal = Number(order.total.numeric)
  } else if (order.summary?.current_order_total != null) {
    numericTotal = Number(order.summary.current_order_total)
  } else if (order.summary?.raw_current_order_total?.value != null) {
    numericTotal = Number(order.summary.raw_current_order_total.value)
  }

  // Fallback: If order.total is 0, string "0.000...", or NaN, compute from line items
  if (!numericTotal || isNaN(numericTotal)) {
    const lineItems = order.items ?? []
    numericTotal = lineItems.reduce((sum: number, item: any) => {
      const price = typeof item.unit_price === "number" ? item.unit_price : parseFloat(item.unit_price ?? "0")
      const qty = item.quantity ?? item.detail?.quantity ?? 1
      return sum + (price * qty)
    }, 0)
  }

  const total = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency === "MXN" ? "MXN" : currency,
  }).format(numericTotal)

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
        const qty = item.quantity ?? item.detail?.quantity ?? 1
        const sub = item.metadata?.is_subscription
          ? ` <i>(suscripción ${item.metadata.interval_days ?? 30}d)</i>`
          : ""
        return `• ${esc(item.title)} x${qty}${sub}`
      })
      .join("\n") || "—"

  const isSmoke = order?.metadata?.smoke_test === true
  const headerText = isSmoke ? "🧪 [SMOKE] Cobro confirmado" : "💳 Cobro confirmado"

  return [
    `<b>${headerText}</b>`,
    "",
    `<b>Orden:</b> ${esc(displayId)}`,
    `<b>Total:</b> ${esc(total)}`,
    `<b>Cliente:</b> ${esc(customerName)}`,
    `<b>Email:</b> ${esc(email)}`,
    `<b>Fecha:</b> ${esc(date)}`,
    "",
    "<b>Productos:</b>",
    productsList,
  ].join("\n")
}

export function mapFulfillmentToTelegramMessage(
  order: any,
  labelUrl: string,
  // extras is unused since the sample-shipment flow no longer goes through
  // this mapper, but the parameter is kept to preserve the existing call
  // signature in envia-create-fulfillment.
  _extras?: { trackingNumber?: string; carrier?: string }
): string {
  const displayId = order.display_id ? `#${order.display_id}` : order.id
  const date = formatDate(order.created_at)

  const items = (order.items ?? []).filter(
    (item: any) => !item.metadata?.is_shipping && !item.is_shipping_cost
  )

  const productsList =
    items
      .map((item: any) => {
        const qty = item.quantity ?? item.detail?.quantity ?? 1
        return `• ${esc(item.title)} x${qty}`
      })
      .join("\n") || "—"

  return [
    "🚚 <b>Orden lista para envío</b>",
    "",
    `<b>Orden:</b> ${esc(displayId)}`,
    `<b>Fecha:</b> ${esc(date)}`,
    "",
    "<b>Productos:</b>",
    productsList,
    "",
    `<b>Etiqueta:</b> <a href="${esc(labelUrl)}">Ver etiqueta PDF</a>`,
  ].join("\n")
}

/**
 * Sample-shipment notification for the influencer flow. Looks different from
 * regular order shipments at a glance — uses 🎁 instead of 🚚, surfaces the
 * influencer name + handle, and shows tracking + label links ops can tap.
 */
export function mapInfluencerSampleShippedToTelegramMessage(input: {
  nombre: string
  email: string
  instagramHandle: string | null
  tiktokHandle: string | null
  parches: string[]
  trackingNumber: string
  carrier: string
  labelUrl: string
  trackUrl: string
}): string {
  const PARCH_NAMES: Record<string, string> = {
    energy: "Energy",
    sleep: "Sleep",
    glow: "Glow",
    shield: "Shield",
    zen: "Zen",
    woman: "Woman",
  }

  const handles =
    [
      input.instagramHandle ? `IG @${input.instagramHandle}` : null,
      input.tiktokHandle ? `TT @${input.tiktokHandle}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—"

  const productsList =
    input.parches.map((p) => PARCH_NAMES[p] ?? p).join(" · ") || "—"

  return [
    "🎁 <b>Muestra para influencer enviada</b>",
    "",
    `<b>Influencer:</b> ${esc(input.nombre)}`,
    `<b>Handles:</b> ${esc(handles)}`,
    `<b>Email:</b> ${esc(input.email)}`,
    `<b>Carrier:</b> ${esc(input.carrier)}`,
    "",
    `<b>Parches enviados:</b> ${esc(productsList)}`,
    `<b>Tracking:</b> ${esc(input.trackingNumber)} · <a href="${esc(input.trackUrl)}">Ver tracking</a>`,
    `<b>Etiqueta:</b> <a href="${esc(input.labelUrl)}">Ver etiqueta PDF</a>`,
  ].join("\n")
}
