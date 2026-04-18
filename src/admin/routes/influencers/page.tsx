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

  const [pendingCount, setPendingCount] = useState(0)
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
      const appRes = await fetch("/admin/influencers?estado=aprobado&limit=200", {
        headers: getAdminHeaders(),
      })
      if (!appRes.ok) return
      const appJson = await appRes.json()
      const accepted: InfluencerApplication[] = appJson.influencer_applications ?? []

      const promoRes = await fetch("/admin/promotions?limit=500", {
        headers: getAdminHeaders(),
      })
      if (!promoRes.ok) {
        setAcceptedWithoutCode(accepted)
        return
      }
      const promoJson = await promoRes.json()
      const influencerPromos: InfluencerPromotion[] = (promoJson.promotions ?? []).filter(isInfluencerPromotion)
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
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h1">Influencers</Heading>
          {activeTab === "codigos" && (
            <Button size="small" onClick={() => { setModalDefaults(undefined); setModalOpen(true) }}>
              Nuevo código
            </Button>
          )}
        </div>

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

        {activeTab === "postulaciones" && (
          <ApplicationsTab refreshKey={refreshKey} />
        )}

        {activeTab === "codigos" && (
          <>
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
