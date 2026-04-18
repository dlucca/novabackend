# Influencer Admin — Página Unificada con Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar en una sola página admin el flujo completo de influencers: revisar postulaciones del formulario del storefront, aceptar/rechazar, y asignar códigos de descuento a los aceptados.

**Architecture:** Dos tabs en `src/admin/routes/influencers/page.tsx` — Tab 1 muestra las `influencer_application` del módulo propio (con filtros de estado y drawer de detalle), Tab 2 mantiene la tabla de promo codes existente más una sección "aceptados sin código" que pre-llena el modal de creación. El vínculo entre postulación y código es implícito por handle (sin FK en DB).

**Tech Stack:** Medusa admin extension (React + TypeScript), `@medusajs/ui`, `@medusajs/admin-sdk`. No hay test runner — verificación manual en `http://localhost:9000/app`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/api/admin/influencers/[id]/route.ts` | Crear | PATCH para actualizar `estado` de una postulación |
| `src/admin/routes/influencers/types.ts` | Modificar | Agregar tipo `InfluencerApplication` |
| `src/admin/routes/influencers/components/application-detail-drawer.tsx` | Crear | Drawer de solo lectura con todos los campos + acciones Aceptar/Rechazar |
| `src/admin/routes/influencers/components/applications-tab.tsx` | Crear | Tab 1 completo: fetch, filtros, tabla, acciones inline |
| `src/admin/routes/influencers/components/new-influencer-modal.tsx` | Modificar | Props opcionales `defaultInfluencerName` y `defaultHandle` |
| `src/admin/routes/influencers/page.tsx` | Modificar | Estructura con dos tabs, badge de pendientes |

---

## Task 1: PATCH endpoint para actualizar estado de postulación

**Files:**
- Create: `src/api/admin/influencers/[id]/route.ts`

- [ ] **Crear directorio y archivo**

```bash
mkdir -p src/api/admin/influencers/\[id\]
```

- [ ] **Escribir el endpoint**

```ts
// src/api/admin/influencers/[id]/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../../modules/influencer"
import InfluencerModuleService from "../../../../modules/influencer/service"

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { estado } = req.body as { estado: string }

  const allowed = ["aprobado", "rechazado", "pendiente"]
  if (!estado || !allowed.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser uno de: ${allowed.join(", ")}` })
  }

  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  const [updated] = await influencerService.updateInfluencerApplications([
    { id, estado } as any,
  ])

  return res.json({ influencer_application: updated })
}
```

- [ ] **Verificar que TypeScript compila sin errores nuevos**

```bash
npx tsc --noEmit 2>&1 | grep -v "client.ts"
```

Esperado: sin output.

- [ ] **Commit**

```bash
git add src/api/admin/influencers/\[id\]/route.ts
git commit -m "feat(influencers): add PATCH /admin/influencers/:id to update estado"
```

---

## Task 2: Tipo `InfluencerApplication` en types.ts

**Files:**
- Modify: `src/admin/routes/influencers/types.ts`

- [ ] **Agregar el tipo al archivo existente**

Abrir `src/admin/routes/influencers/types.ts` y agregar al final:

```ts
export type InfluencerApplication = {
  id: string
  nombre: string
  email: string
  pais: string
  red_principal: string
  handle: string
  handle_secundario: string | null
  link_perfil: string
  rango_seguidores: string
  nicho: string[]
  tipo_contenido: string[]
  genero_audiencia: string
  edad_audiencia: string
  tiene_contenido_bienestar: string
  marcas_previas: string | null
  parches: string[]
  modalidad: string[]
  media_kit: string | null
  media_kit_url: string | null
  mensaje_libre: string | null
  estado: "pendiente" | "aprobado" | "rechazado"
  created_at: string
}
```

- [ ] **Commit**

```bash
git add src/admin/routes/influencers/types.ts
git commit -m "feat(influencers): add InfluencerApplication type"
```

---

## Task 3: ApplicationDetailDrawer — drawer de detalle de postulación

**Files:**
- Create: `src/admin/routes/influencers/components/application-detail-drawer.tsx`

Este drawer es de solo lectura. Muestra todos los campos del formulario agrupados por sección. Para postulaciones pendientes, muestra botones Aceptar/Rechazar.

- [ ] **Crear el archivo**

```tsx
// src/admin/routes/influencers/components/application-detail-drawer.tsx
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
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "client.ts"
```

Esperado: sin output.

- [ ] **Commit**

```bash
git add src/admin/routes/influencers/components/application-detail-drawer.tsx
git commit -m "feat(influencers): add ApplicationDetailDrawer component"
```

---

## Task 4: ApplicationsTab — Tab 1 completo

**Files:**
- Create: `src/admin/routes/influencers/components/applications-tab.tsx`

Este componente maneja fetch, filtros de estado, tabla con acciones inline, y abre el drawer de detalle.

- [ ] **Crear el archivo**

```tsx
// src/admin/routes/influencers/components/applications-tab.tsx
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

type FilterEstado = "pendiente" | "aprobado" | "rechazado" | "all"

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
  }

  const filtered = filter === "all" ? applications : applications.filter((a) => a.estado === filter)

  const handleInlineAction = async (
    e: React.MouseEvent,
    id: string,
    estado: "aprobado" | "rechazado"
  ) => {
    e.stopPropagation()
    await fetch(`/admin/influencers/${id}`, {
      method: "PATCH",
      headers: getAdminHeaders(),
      body: JSON.stringify({ estado }),
    })
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, estado } : a))
    )
  }

  const handleStatusChange = (id: string, estado: "aprobado" | "rechazado") => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, estado } : a))
    )
  }

  const estadoBadge = (estado: string) => {
    if (estado === "aprobado") return <Badge color="green" size="small">aprobado</Badge>
    if (estado === "rechazado") return <Badge color="red" size="small">rechazado</Badge>
    return <Badge color="orange" size="small">pendiente</Badge>
  }

  const filters: { key: FilterEstado; label: string; count?: number }[] = [
    { key: "pendiente", label: "Pendientes", count: counts.pendiente },
    { key: "aprobado", label: "Aprobados", count: counts.aprobado },
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
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "client.ts"
```

Esperado: sin output.

- [ ] **Commit**

```bash
git add src/admin/routes/influencers/components/applications-tab.tsx
git commit -m "feat(influencers): add ApplicationsTab component with filters and inline actions"
```

---

## Task 5: Modificar NewInfluencerModal para pre-llenado desde postulación

**Files:**
- Modify: `src/admin/routes/influencers/components/new-influencer-modal.tsx`

Agregar dos props opcionales que pre-llenan el formulario cuando se abre desde la sección "aceptados sin código".

- [ ] **Actualizar el tipo `Props` y el `useState` inicial**

En `new-influencer-modal.tsx`, reemplazar el bloque `type Props` y la función `NewInfluencerModal`:

```tsx
// Reemplazar:
type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewInfluencerModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    influencer_name: "",
    handle: "",
    code: "",
    value: "10",
    ends_at: "",
  })

// Por:
type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultInfluencerName?: string
  defaultHandle?: string
}

export function NewInfluencerModal({ open, onClose, onCreated, defaultInfluencerName, defaultHandle }: Props) {
  const [form, setForm] = useState({
    influencer_name: defaultInfluencerName ?? "",
    handle: defaultHandle ?? "",
    code: "",
    value: "10",
    ends_at: "",
  })
```

- [ ] **Agregar `useEffect` para sincronizar cuando las props cambian**

Después del `useState`, agregar:

```tsx
  useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...prev,
        influencer_name: defaultInfluencerName ?? prev.influencer_name,
        handle: defaultHandle ?? prev.handle,
      }))
    }
  }, [open, defaultInfluencerName, defaultHandle])
```

Y agregar `useEffect` al import de React:

```tsx
import { useState, useEffect } from "react"
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "client.ts"
```

Esperado: sin output.

- [ ] **Commit**

```bash
git add src/admin/routes/influencers/components/new-influencer-modal.tsx
git commit -m "feat(influencers): add defaultInfluencerName and defaultHandle props to NewInfluencerModal"
```

---

## Task 6: Actualizar page.tsx con tabs y sección "aceptados sin código"

**Files:**
- Modify: `src/admin/routes/influencers/page.tsx`

Este es el paso final. Reemplaza el contenido actual por la estructura con dos tabs. El Tab 2 agrega la sección "aceptados sin código" sobre la tabla existente.

- [ ] **Reemplazar el contenido completo de page.tsx**

```tsx
// src/admin/routes/influencers/page.tsx
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { MagnifyingGlass } from "@medusajs/icons"
import { Container, Heading, Button, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { InfluencerTable } from "./components/influencer-table"
import { NewInfluencerModal } from "./components/new-influencer-modal"
import { InfluencerDetailDrawer } from "./components/influencer-detail-drawer"
import { ApplicationsTab } from "./components/applications-tab"
import { isInfluencerPromotion, parseInfluencerCampaign } from "./types"
import type { InfluencerPromotion, InfluencerApplication } from "./types"

function getAdminHeaders(): Record<string, string> {
  const token = localStorage.getItem("medusa_auth_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type Tab = "postulaciones" | "codigos"

const InfluencersPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>("postulaciones")
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaults, setModalDefaults] = useState<{ name: string; handle: string } | undefined>()
  const [selectedPromo, setSelectedPromo] = useState<InfluencerPromotion | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Pending badge count
  const [pendingCount, setPendingCount] = useState(0)

  // Accepted without code
  const [acceptedWithoutCode, setAcceptedWithoutCode] = useState<InfluencerApplication[]>([])

  useEffect(() => {
    const loadPendingCount = async () => {
      const res = await fetch("/admin/influencers?estado=pendiente&limit=200", {
        headers: getAdminHeaders(),
      })
      if (res.ok) {
        const json = await res.json()
        setPendingCount(json.count ?? 0)
      }
    }
    loadPendingCount()
  }, [refreshKey])

  useEffect(() => {
    if (activeTab !== "codigos") return

    const loadAcceptedWithoutCode = async () => {
      // Fetch accepted applications
      const appRes = await fetch("/admin/influencers?estado=aprobado&limit=200", {
        headers: getAdminHeaders(),
      })
      if (!appRes.ok) return
      const appJson = await appRes.json()
      const accepted: InfluencerApplication[] = appJson.influencer_applications ?? []

      // Fetch existing promo codes
      const promoRes = await fetch("/admin/promotions?limit=500", {
        headers: getAdminHeaders(),
      })
      if (!promoRes.ok) {
        setAcceptedWithoutCode(accepted)
        return
      }
      const promoJson = await promoRes.json()
      const influencerPromos: InfluencerPromotion[] = (promoJson.promotions ?? []).filter(isInfluencerPromotion)
      // Normalize both sides: strip leading @ and lowercase before comparing
      const existingHandles = new Set(
        influencerPromos.map((p) =>
          parseInfluencerCampaign(p.campaign?.name).handle.toLowerCase().replace(/^@/, "")
        )
      )

      setAcceptedWithoutCode(
        accepted.filter((a) => !existingHandles.has(a.handle.toLowerCase().replace(/^@/, "")))
      )
    }
    loadAcceptedWithoutCode()
  }, [activeTab, refreshKey])

  const handleCreated = () => {
    setRefreshKey((k) => k + 1)
    setModalDefaults(undefined)
  }

  const openModalForApplication = (app: InfluencerApplication) => {
    setModalDefaults({ name: app.nombre, handle: app.handle })
    setModalOpen(true)
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "postulaciones", label: "Postulaciones", badge: pendingCount > 0 ? pendingCount : undefined },
    { key: "codigos", label: "Códigos activos" },
  ]

  return (
    <div className="flex flex-col gap-4 p-8">
      <Container className="divide-y p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h1">Influencers</Heading>
          {activeTab === "codigos" && (
            <Button size="small" onClick={() => { setModalDefaults(undefined); setModalOpen(true) }}>
              Nuevo código
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ui-border-base bg-ui-bg-subtle">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-ui-fg-base text-ui-fg-base"
                  : "border-transparent text-ui-fg-muted hover:text-ui-fg-base"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="bg-ui-tag-red-bg text-ui-tag-red-text text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "postulaciones" && (
          <ApplicationsTab refreshKey={refreshKey} />
        )}

        {activeTab === "codigos" && (
          <>
            {/* Accepted without code */}
            {acceptedWithoutCode.length > 0 && (
              <div className="px-6 py-4 bg-[#fffbeb] border-b border-[#fde68a]">
                <Text size="small" weight="plus" className="text-[#92400e] mb-3">
                  Aceptados sin código ({acceptedWithoutCode.length}) — asignales un código
                </Text>
                <div className="flex flex-wrap gap-3">
                  {acceptedWithoutCode.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center gap-3 bg-white border border-[#fde68a] rounded-lg px-3 py-2"
                    >
                      <div>
                        <Text size="small" weight="plus">{app.nombre}</Text>
                        <Text size="xsmall" className="text-ui-fg-muted">{app.handle}</Text>
                      </div>
                      <Button size="small" onClick={() => openModalForApplication(app)}>
                        + Crear código
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing codes table */}
            <InfluencerTable
              onNew={() => { setModalDefaults(undefined); setModalOpen(true) }}
              onSelect={(promo) => setSelectedPromo(promo)}
              refreshKey={refreshKey}
            />
          </>
        )}
      </Container>

      <NewInfluencerModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setModalDefaults(undefined) }}
        onCreated={handleCreated}
        defaultInfluencerName={modalDefaults?.name}
        defaultHandle={modalDefaults?.handle}
      />

      <InfluencerDetailDrawer
        promotion={selectedPromo}
        onClose={() => setSelectedPromo(null)}
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Influencers",
  icon: MagnifyingGlass,
})

export default InfluencersPage
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "client.ts"
```

Esperado: sin output.

- [ ] **Verificar en el admin** — correr el backend y abrir `http://localhost:9000/app`

```bash
npm run dev
```

Verificar:
1. La página "Influencers" muestra dos tabs
2. Tab "Postulaciones" carga desde `/admin/influencers`
3. Los filtros Pendientes/Aprobados/Rechazados/Todos funcionan
4. Clic en fila abre el drawer con los datos de la postulación
5. Aceptar/Rechazar actualiza el estado inline y en el drawer
6. Tab "Códigos activos" muestra la tabla existente sin regresiones
7. Si hay aprobados sin código, aparece la sección amarilla con "Crear código"
8. "Crear código" abre el modal con nombre y handle pre-llenados

- [ ] **Commit final**

```bash
git add src/admin/routes/influencers/page.tsx
git commit -m "feat(influencers): unified admin page with tabs — postulaciones + codigos"
```

---

## Task 7: Push y PR

- [ ] **Push y abrir PR contra main**

```bash
git push origin feature/influencers-medusa-module 2>/dev/null || git push origin HEAD
```

Si ya fue mergeado, crear una nueva branch:

```bash
git checkout -b feature/influencers-unified-admin
git push -u origin feature/influencers-unified-admin
gh pr create \
  --title "feat(influencers): unified admin page — postulaciones + codes tabs" \
  --body "Adds two-tab admin page unifying application review and promo code management. See spec: docs/superpowers/specs/2026-04-18-influencer-unified-admin-design.md"
```
