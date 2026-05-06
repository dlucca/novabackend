import { useState } from "react"
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

export function ApplicationDetailDrawer({ application, onClose, onStatusChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [rejectingOpen, setRejectingOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [error, setError] = useState<string | null>(null)

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
    <Drawer open={!!application} onOpenChange={(v) => !v && onClose()}>
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
                  {application.pedido_id && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Orden:{" "}
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
          {application?.estado === "aprobado" && !rejectingOpen && (
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
              {/* "Enviar muestras" llega en el chunk 2. Por ahora solo dejamos
                  el estado approved — el envío se hace manual desde Envia. */}
              <Button disabled title="Disponible en próxima versión">
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
          {/* Estado "enviado" es terminal — no acciones, solo cerrar */}
          <Button variant="transparent" onClick={onClose}>Cerrar</Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
