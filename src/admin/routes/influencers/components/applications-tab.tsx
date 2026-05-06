import { useEffect, useState } from "react"
import { Table, Text, Button, Badge } from "@medusajs/ui"
import { ApplicationDetailDrawer } from "./application-detail-drawer"
import type { InfluencerApplication } from "../types"

function getAdminHeaders(): Record<string, string> {
  const token = localStorage.getItem("medusa_auth_token")
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" }
}

type FilterEstado = "pendiente" | "aprobado" | "rechazado" | "enviado" | "all"

type Props = {
  refreshKey: number
}

export function ApplicationsTab({ refreshKey }: Props) {
  const [applications, setApplications] = useState<InfluencerApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterEstado>("pendiente")
  const [selected, setSelected] = useState<InfluencerApplication | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch("/admin/influencers?limit=200", {
          headers: getAdminHeaders(),
        })
        if (!res.ok) return
        const json = await res.json()
        setApplications(json.influencer_applications ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshKey])

  const counts = {
    pendiente: applications.filter((a) => a.estado === "pendiente").length,
    aprobado: applications.filter((a) => a.estado === "aprobado").length,
    rechazado: applications.filter((a) => a.estado === "rechazado").length,
    enviado: applications.filter((a) => a.estado === "enviado").length,
  }

  const filtered = filter === "all" ? applications : applications.filter((a) => a.estado === filter)

  const handleInlineAction = async (
    e: React.MouseEvent,
    id: string,
    estado: "aprobado" | "rechazado"
  ) => {
    e.stopPropagation()
    const res = await fetch(`/admin/influencers/${id}`, {
      method: "PATCH",
      headers: getAdminHeaders(),
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) return
    const json = await res.json()
    // Use the full server response so new timestamp fields stay in sync
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...json.influencer_application } : a))
    )
  }

  // Drawer returns the full updated application so timestamps/reason flow back
  // into the table view without a refetch.
  const handleStatusChange = (id: string, updated: InfluencerApplication) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updated } : a))
    )
  }

  const estadoBadge = (estado: string) => {
    if (estado === "aprobado") return <Badge color="green" size="small">aprobado</Badge>
    if (estado === "rechazado") return <Badge color="red" size="small">rechazado</Badge>
    if (estado === "enviado") return <Badge color="blue" size="small">enviado</Badge>
    return <Badge color="orange" size="small">pendiente</Badge>
  }

  const filters: { key: FilterEstado; label: string; count?: number }[] = [
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "aprobado", label: "Aprobados", count: counts.aprobado },
    { key: "enviado", label: "Enviados", count: counts.enviado },
    { key: "rechazado", label: "Rechazados", count: counts.rechazado },
    { key: "all", label: "Todos" },
  ]

  if (loading) {
    return <div className="px-6 py-8 text-center"><Text className="text-ui-fg-muted">Cargando...</Text></div>
  }

  if (applications.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <Text className="text-ui-fg-muted">No hay postulaciones todavía.</Text>
      </div>
    )
  }

  return (
    <>
      {/* Filter pills */}
      <div className="flex gap-2 px-6 py-3 border-b border-ui-border-base">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-ui-button-inverted text-ui-fg-on-inverted"
                : "bg-ui-bg-subtle text-ui-fg-muted hover:bg-ui-bg-base"
            }`}
          >
            {f.label}
            {f.count !== undefined && (
              <span className={`text-xs rounded-full px-1.5 ${
                filter === f.key ? "bg-white/20" : "bg-ui-bg-base"
              }`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <Text className="text-ui-fg-muted">No hay postulaciones en este estado.</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Nombre</Table.HeaderCell>
              <Table.HeaderCell>Handle</Table.HeaderCell>
              <Table.HeaderCell>Red</Table.HeaderCell>
              <Table.HeaderCell>Seguidores</Table.HeaderCell>
              <Table.HeaderCell>Estado</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.map((app) => (
              <Table.Row
                key={app.id}
                className="cursor-pointer"
                onClick={() => setSelected(app)}
              >
                <Table.Cell>
                  <Text size="small" weight="plus">{app.nombre}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-muted">{app.handle}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{app.red_principal}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{app.rango_seguidores}</Text>
                </Table.Cell>
                <Table.Cell>{estadoBadge(app.estado)}</Table.Cell>
                <Table.Cell>
                  {app.estado === "pendiente" && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={(e) => handleInlineAction(e, app.id, "aprobado")}
                      >
                        Aceptar
                      </Button>
                      <Button
                        size="small"
                        variant="transparent"
                        className="text-ui-fg-error"
                        onClick={(e) => handleInlineAction(e, app.id, "rechazado")}
                      >
                        Rechazar
                      </Button>
                    </div>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <ApplicationDetailDrawer
        application={selected}
        onClose={() => setSelected(null)}
        onStatusChange={handleStatusChange}
      />
    </>
  )
}
