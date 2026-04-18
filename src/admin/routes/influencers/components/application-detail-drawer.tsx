import { Drawer, Heading, Text, Button, Badge } from "@medusajs/ui"
import type { InfluencerApplication } from "../types"

function getAdminHeaders(): Record<string, string> {
  const token = localStorage.getItem("medusa_auth_token")
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" }
}

type Props = {
  application: InfluencerApplication | null
  onClose: () => void
  onStatusChange: (id: string, estado: "aprobado" | "rechazado") => void
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

export function ApplicationDetailDrawer({ application, onClose, onStatusChange }: Props) {
  const handleAction = async (estado: "aprobado" | "rechazado") => {
    if (!application) return
    await fetch(`/admin/influencers/${application.id}`, {
      method: "PATCH",
      headers: getAdminHeaders(),
      body: JSON.stringify({ estado }),
    })
    onStatusChange(application.id, estado)
    onClose()
  }

  const estadoBadge = (estado: string) => {
    if (estado === "aprobado") return <Badge color="green">aprobado</Badge>
    if (estado === "rechazado") return <Badge color="red">rechazado</Badge>
    return <Badge color="orange">pendiente</Badge>
  }

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
                  {new Date(application.created_at).toLocaleDateString("es-MX", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </Text>
              </div>

              <div className="flex flex-col gap-3">
                <Heading level="h3">Identidad</Heading>
                <Field label="Nombre" value={application.nombre} />
                <Field label="Email" value={application.email} />
                <Field label="País" value={application.pais} />
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
                <TagList label="Modalidad" values={application.modalidad} />
                <Field label="Media kit" value={application.media_kit} />
                <Field label="URL media kit" value={application.media_kit_url} />
                <Field label="Mensaje" value={application.mensaje_libre} />
              </div>
            </>
          )}
        </Drawer.Body>

        <Drawer.Footer>
          {application?.estado === "pendiente" && (
            <>
              <Button variant="secondary" onClick={() => handleAction("rechazado")}>
                Rechazar
              </Button>
              <Button onClick={() => handleAction("aprobado")}>
                Aceptar
              </Button>
            </>
          )}
          <Button variant="transparent" onClick={onClose}>Cerrar</Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
