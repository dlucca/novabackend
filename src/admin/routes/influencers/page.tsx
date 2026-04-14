import { defineRouteConfig } from "@medusajs/admin-sdk"
import { MagnifyingGlass } from "@medusajs/icons"
import { Container, Heading, Button } from "@medusajs/ui"
import { useState } from "react"
import { InfluencerTable } from "./components/influencer-table"
import { NewInfluencerModal } from "./components/new-influencer-modal"
import { InfluencerDetailDrawer } from "./components/influencer-detail-drawer"
import type { InfluencerPromotion } from "./types"

const InfluencersPage = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPromo, setSelectedPromo] = useState<InfluencerPromotion | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleCreated = () => setRefreshKey((k) => k + 1)

  return (
    <div className="flex flex-col gap-4 p-8">
      <Container className="divide-y p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h1">Influencers</Heading>
          <Button size="small" onClick={() => setModalOpen(true)}>
            Nuevo código
          </Button>
        </div>

        {/* Table */}
        <InfluencerTable
          onNew={() => setModalOpen(true)}
          onSelect={(promo) => setSelectedPromo(promo)}
          refreshKey={refreshKey}
        />
      </Container>

      {/* Create modal */}
      <NewInfluencerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Detail drawer */}
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
