import { useRef, useState } from "react"
import { Drawer, Heading, Text, Button, Badge, Textarea } from "@medusajs/ui"
import type { InfluencerApplication } from "../types"

function getAdminHeaders(): Record<string, string> {
  const token = localStorage.getItem("medusa_auth_token")
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" }
}

type Status = InfluencerApplication["estado"]

type Props = {
  application: InfluencerApplication | null
  onClose: () => void
  onStatusChange: (id: string, app: InfluencerApplication) => void
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <Text size="xsmall" className="text-ui-fg-muted mb-0.5">{label}</Text>
      <Text size="small">{value}</Text>
    </div>
  )
}

function TagList({ label, values }: { label: string; values: string[] }) {
  if (!values?.length) return null
  return (
    <div>
      <Text size="xsmall" className="text-ui-fg-muted mb-1">{label}</Text>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span key={v} className="bg-ui-bg-subtle text-ui-fg-base text-xs px-2 py-0.5 rounded-full">{v}</span>
        ))}
      </div>
    </div>
  )
}

function estadoBadge(estado: Status) {
  if (estado === "aprobado") return <Badge color="green">aprobado</Badge>
  if (estado === "rechazado") return <Badge color="red">rechazado</Badge>
  if (estado === "enviado") return <Badge color="blue">enviado</Badge>
  return <Badge color="orange">pendiente</Badge>
}

// Shipping flow state machine. Each state shows distinct UI in the drawer
// so the admin always knows what's happening — clicking "Enviar muestras"
// previously gave only a tiny button-spinner for 8+ seconds with no
// feedback, which led people to double-click thinking nothing was happening.
type ShipPhase =
  | "idle"          // user hasn't started the ship flow yet
  | "confirming"    // confirmation card visible, awaiting "Sí, enviar"
  | "processing"    // workflow running on server
  | "success"       // workflow returned OK — show tracking + dismiss CTA
  | "error"         // workflow returned an error — show message + retry

type ShipResult = {
  order_id: string
  tracking_number?: string
  tracking_url?: string
  carrier?: string
}

export function ApplicationDetailDrawer({ application, onClose, onStatusChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [rejectingOpen, setRejectingOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [shipPhase, setShipPhase] = useState<ShipPhase>("idle")
  const [shipResult, setShipResult] = useState<ShipResult | null>(null)
  const [shipError, setShipError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const PARCH_NAMES: Record<string, string> = {
    energy: "Energy",
    sleep: "Sleep",
    glow: "Glow",
    shield: "Shield",
    zen: "Zen",
    woman: "Woman",
  }

  // True while the shipping workflow is in flight — used to disable the
  // drawer close button so the user can't accidentally navigate away
  // mid-shipment (which wouldn't cancel the workflow but would lose UI
  // visibility into the result).
  const shipInFlight = shipPhase === "processing"

  // Synchronous mutex via useRef — React state updates are async, so
  // setShipPhase("processing") doesn't block a fast double-click from
  // entering ship() twice before the next render. A ref does, because
  // ref reads/writes are immediate.
  const shippingInFlightRef = useRef(false)

  const ship = async () => {
    if (!application) return
    if (shippingInFlightRef.current) {
      // Defensive — UI button is also disabled, but if both clicks slip
      // through during the same render frame, the second one bounces here.
      return
    }
    shippingInFlightRef.current = true
    setShipPhase("processing")
    setShipError(null)
    try {
      const res = await fetch(`/admin/influencers/${application.id}/ship`, {
        method: "POST",
        headers: getAdminHeaders(),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShipError(json.error ?? "No se pudo enviar las muestras.")
        setShipPhase("error")
        return
      }
      setShipResult({
        order_id: json.order_id,
        tracking_number: json.tracking_number,
        tracking_url: json.tracking_url,
        carrier: json.carrier,
      })
      setShipPhase("success")
      // Bubble up so the table updates immediately. We don't close the
      // drawer here — let the user dismiss it after seeing the tracking.
      onStatusChange(application.id, {
        ...application,
        estado: "enviado",
        enviado_en: new Date().toISOString(),
        tracking_number: json.tracking_number ?? null,
        label_url: json.label_url ?? null,
        carrier: json.carrier ?? null,
      })
    } catch (err) {
      setShipError(err instanceof Error ? err.message : String(err))
      setShipPhase("error")
    } finally {
      // Release the synchronous mutex regardless of outcome so the user
      // can reintentar from the error card.
      shippingInFlightRef.current = false
    }
  }

  // Reset shipping UI state when the drawer closes so reopening starts
  // fresh. Without this, a previous error would still be visible.
  const closeDrawer = () => {
    if (shipInFlight) return
    setShipPhase("idle")
    setShipResult(null)
    setShipError(null)
    setRejectingOpen(false)
    setRejectReason("")
    onClose()
  }

  const patchEstado = async (
    estado: Status,
    extra: Record<string, unknown> = {}
  ) => {
    if (!application) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/admin/influencers/${application.id}`, {
        method: "PATCH",
        headers: getAdminHeaders(),
        body: JSON.stringify({ estado, ...extra }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? "No se pudo actualizar el estado.")
        return
      }
      const json = await res.json()
      onStatusChange(application.id, json.influencer_application)
      setRejectingOpen(false)
      setRejectReason("")
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("es-MX", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null

  return (
    <Drawer open={!!application} onOpenChange={(v) => !v && closeDrawer()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{application?.nombre ?? "Postulación"}</Drawer.Title>
        </Drawer.Header>

        <Drawer.Body className="flex flex-col gap-6 p-6 overflow-y-auto">
          {application && (
            <>
              <div className="flex items-center gap-2">
                {estadoBadge(application.estado)}
                <Text size="xsmall" className="text-ui-fg-muted">
                  Recibida el{" "}
                  {new Date(application.created_at).toLocaleDateString("es-MX", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </Text>
              </div>

              {/* State-transition audit (visible once any transition has happened) */}
              {(application.aprobado_en || application.rechazado_en || application.enviado_en) && (
                <div className="flex flex-col gap-1 px-3 py-2 rounded-md bg-ui-bg-subtle">
                  {application.aprobado_en && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Aprobada: {formatDate(application.aprobado_en)}
                    </Text>
                  )}
                  {application.rechazado_en && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Rechazada: {formatDate(application.rechazado_en)}
                    </Text>
                  )}
                  {application.motivo_rechazo && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Motivo: {application.motivo_rechazo}
                    </Text>
                  )}
                  {application.enviado_en && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Muestras enviadas: {formatDate(application.enviado_en)}
                    </Text>
                  )}
                  {application.tracking_number && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Tracking: <strong>{application.tracking_number}</strong>
                      {application.carrier ? ` · ${application.carrier}` : ""}
                    </Text>
                  )}
                  {application.label_url && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      <a
                        href={application.label_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ui-fg-interactive underline"
                      >
                        Ver etiqueta PDF
                      </a>
                    </Text>
                  )}
                  {/* Legacy — early sample shipments stored a Medusa Order id here. */}
                  {!application.tracking_number && application.pedido_id && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Orden (legacy):{" "}
                      <a
                        href={`/a/orders/${application.pedido_id}`}
                        className="text-ui-fg-interactive underline"
                      >
                        {application.pedido_id}
                      </a>
                    </Text>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Heading level="h3">Identidad</Heading>
                <Field label="Nombre" value={application.nombre} />
                <Field label="Email" value={application.email} />
                <Field label="País" value={application.pais} />
                <Field
                  label="Instagram"
                  value={application.instagram_handle ? `@${application.instagram_handle}` : null}
                />
                <Field
                  label="TikTok"
                  value={application.tiktok_handle ? `@${application.tiktok_handle}` : null}
                />
                <Field label="Red principal" value={application.red_principal} />
                <Field label="Handle" value={application.handle} />
                <Field label="Handle secundario" value={application.handle_secundario} />
                <Field label="Link de perfil" value={application.link_perfil} />
              </div>

              <div className="flex flex-col gap-3">
                <Heading level="h3">Comunidad y contenido</Heading>
                <Field label="Seguidores" value={application.rango_seguidores} />
                <TagList label="Nicho" values={application.nicho} />
                <TagList label="Tipo de contenido" values={application.tipo_contenido} />
                <Field label="Género de audiencia" value={application.genero_audiencia} />
                <Field label="Edad de audiencia" value={application.edad_audiencia} />
                <Field label="Crea contenido de bienestar" value={application.tiene_contenido_bienestar} />
                <Field label="Marcas previas" value={application.marcas_previas} />
              </div>

              <div className="flex flex-col gap-3">
                <Heading level="h3">Fit con Novapatch</Heading>
                <TagList label="Parches de interés" values={application.parches} />
                <TagList label="Modalidad" values={application.modalidad ?? []} />
                <Field label="Media kit" value={application.media_kit} />
                <Field label="URL media kit" value={application.media_kit_url} />
                <Field label="Mensaje" value={application.mensaje_libre} />
              </div>

              {application.direccion && (
                <div className="flex flex-col gap-3">
                  <Heading level="h3">Dirección de envío</Heading>
                  <Field
                    label="Calle y número"
                    value={
                      application.direccion.street &&
                      `${application.direccion.street}${
                        application.direccion.interior
                          ? ` Int ${application.direccion.interior}`
                          : ""
                      }`
                    }
                  />
                  <Field label="Colonia" value={application.direccion.colonia} />
                  <Field
                    label="Ciudad / Estado"
                    value={
                      application.direccion.city && application.direccion.state
                        ? `${application.direccion.city}, ${application.direccion.state}`
                        : application.direccion.city ?? application.direccion.state
                    }
                  />
                  <Field label="Código postal" value={application.direccion.zip} />
                  <Field
                    label="Instrucciones"
                    value={application.direccion.instructions}
                  />
                </div>
              )}

              {/* Ship flow — confirming state. Shows what will be shipped
                  and asks for explicit confirmation. */}
              {shipPhase === "confirming" && (
                <div className="flex flex-col gap-3 p-3 rounded-md border border-ui-border-base bg-ui-bg-subtle">
                  <Text size="small" weight="plus">Confirmar envío de muestras</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Se va a crear una orden con los siguientes parches y se
                    generará la etiqueta de Envia. <strong>No es reversible.</strong>
                  </Text>
                  <div>
                    <Text size="xsmall" className="text-ui-fg-muted mb-1">Parches a enviar</Text>
                    <div className="flex flex-wrap gap-1">
                      {(application.parches ?? []).map((p) => (
                        <span
                          key={p}
                          className="bg-ui-bg-base text-ui-fg-base text-xs px-2 py-0.5 rounded-full"
                        >
                          {PARCH_NAMES[p] ?? p}
                        </span>
                      ))}
                    </div>
                  </div>
                  {application.direccion && (
                    <div>
                      <Text size="xsmall" className="text-ui-fg-muted mb-1">A esta dirección</Text>
                      <Text size="xsmall">
                        {application.direccion.street}
                        {application.direccion.interior ? ` Int ${application.direccion.interior}` : ""}
                        {", "}
                        {application.direccion.colonia}
                        {", "}
                        {application.direccion.city}, {application.direccion.state}{" "}
                        {application.direccion.zip}
                      </Text>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="transparent"
                      size="small"
                      onClick={() => setShipPhase("idle")}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="small"
                      onClick={ship}
                      disabled={shipPhase !== "confirming"}
                    >
                      Sí, enviar
                    </Button>
                  </div>
                </div>
              )}

              {/* Ship flow — processing state. The workflow takes 8-30s
                  end-to-end (Envia rate quotes + label generation +
                  Medusa fulfillment + email). Show a clear "in progress"
                  card so the admin doesn't double-click thinking
                  nothing's happening. */}
              {shipPhase === "processing" && (
                <div className="flex flex-col items-center gap-3 p-6 rounded-md border-2 border-dashed border-ui-border-base bg-ui-bg-subtle">
                  <div
                    className="w-8 h-8 rounded-full border-[3px] border-ui-border-strong border-t-transparent animate-spin"
                    aria-hidden
                  />
                  <Text size="small" weight="plus">Procesando envío…</Text>
                  <Text size="xsmall" className="text-ui-fg-muted text-center">
                    Reservando inventario, generando etiqueta de Envia y enviando email.
                    <br />
                    Esto puede tardar entre 10 y 30 segundos.
                    <br />
                    <strong>No cierres esta ventana.</strong>
                  </Text>
                </div>
              )}

              {/* Ship flow — success state. Shows tracking info before
                  letting the admin dismiss, so they have a chance to
                  copy/save the guide number. */}
              {shipPhase === "success" && shipResult && (
                <div className="flex flex-col gap-3 p-4 rounded-md border border-ui-tag-green-border bg-ui-tag-green-bg">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 18 }}>✅</span>
                    <Text size="small" weight="plus" className="text-ui-tag-green-text">
                      Muestras enviadas
                    </Text>
                  </div>
                  {shipResult.tracking_number && (
                    <div>
                      <Text size="xsmall" className="text-ui-fg-muted mb-0.5">Número de guía</Text>
                      <Text size="small" weight="plus">
                        {shipResult.tracking_number}
                        {shipResult.carrier ? ` · ${shipResult.carrier}` : ""}
                      </Text>
                    </div>
                  )}
                  {shipResult.tracking_url && (
                    <a
                      href={shipResult.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ui-fg-interactive text-xs underline"
                    >
                      Ver tracking en Envia ↗
                    </a>
                  )}
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Se notificó al canal #orders en Slack y se envió el email
                    al influencer con el link de tracking.
                  </Text>
                </div>
              )}

              {/* Ship flow — error state. Show the message and offer a
                  retry path. The Redis lock has a 5-min TTL so retries
                  shortly after failure may bounce — that's intentional
                  to prevent duplicate labels. */}
              {shipPhase === "error" && (
                <div className="flex flex-col gap-3 p-3 rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <Text size="small" weight="plus" className="text-ui-tag-red-text">
                      No se pudo completar el envío
                    </Text>
                  </div>
                  {shipError && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {shipError}
                    </Text>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="transparent"
                      size="small"
                      onClick={() => {
                        setShipPhase("idle")
                        setShipError(null)
                      }}
                    >
                      Cerrar
                    </Button>
                    <Button size="small" onClick={ship}>
                      Reintentar
                    </Button>
                  </div>
                </div>
              )}

              {/* Reject reason inline form */}
              {rejectingOpen && (
                <div className="flex flex-col gap-2 p-3 rounded-md border border-ui-border-base bg-ui-bg-subtle">
                  <Text size="small" weight="plus">Motivo del rechazo (interno, opcional)</Text>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Notas internas — no se comparte con la postulante."
                    rows={3}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="transparent"
                      size="small"
                      onClick={() => {
                        setRejectingOpen(false)
                        setRejectReason("")
                      }}
                      disabled={busy}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => patchEstado("rechazado", { motivo_rechazo: rejectReason })}
                      isLoading={busy}
                    >
                      Confirmar rechazo
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <Text size="small" className="text-ui-fg-error">{error}</Text>
              )}
            </>
          )}
        </Drawer.Body>

        <Drawer.Footer>
          {application?.estado === "pendiente" && !rejectingOpen && (
            <>
              <Button
                variant="secondary"
                onClick={() => setRejectingOpen(true)}
                disabled={busy}
              >
                Rechazar
              </Button>
              <Button onClick={() => patchEstado("aprobado")} isLoading={busy}>
                Aprobar
              </Button>
            </>
          )}
          {application?.estado === "aprobado" && !rejectingOpen && shipPhase === "idle" && (
            <>
              <Button
                variant="transparent"
                onClick={() => patchEstado("pendiente")}
                disabled={busy}
              >
                Volver a pendiente
              </Button>
              <Button
                variant="secondary"
                onClick={() => setRejectingOpen(true)}
                disabled={busy}
              >
                Rechazar
              </Button>
              <Button
                onClick={() => setShipPhase("confirming")}
                disabled={busy}
              >
                Enviar muestras
              </Button>
            </>
          )}
          {application?.estado === "rechazado" && !rejectingOpen && (
            <Button
              variant="transparent"
              onClick={() => patchEstado("pendiente")}
              disabled={busy}
            >
              Volver a pendiente
            </Button>
          )}
          {/* Estado "enviado" es terminal — no acciones, solo cerrar.
              Cerrar también queda deshabilitado mientras hay un envío en
              curso para evitar perder visibilidad del resultado. */}
          <Button
            variant="transparent"
            onClick={closeDrawer}
            disabled={shipInFlight}
            title={shipInFlight ? "Esperá a que termine el envío" : undefined}
          >
            Cerrar
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
