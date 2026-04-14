// Shared types for the influencer admin feature

// Campaign name encodes influencer info as "INF|Name|@handle"
export type InfluencerCampaign = {
  id?: string
  name?: string
  starts_at: string | null
  ends_at: string | null
}

export type InfluencerPromotion = {
  id: string
  code: string
  status: string
  usage_count: number
  campaigns: InfluencerCampaign[]
  application_method: { value: number } | null
}

// Parses influencer name and handle from the campaign name ("INF|Name|@handle")
export function parseInfluencerCampaign(name?: string): { influencer_name: string; handle: string } {
  if (!name?.startsWith("INF|")) return { influencer_name: "—", handle: "—" }
  const parts = name.split("|")
  return {
    influencer_name: parts[1] ?? "—",
    handle: parts[2] ?? "—",
  }
}

// Returns true if this promotion was created as an influencer code
export function isInfluencerPromotion(promo: InfluencerPromotion): boolean {
  return promo.campaigns?.[0]?.name?.startsWith("INF|") ?? false
}
