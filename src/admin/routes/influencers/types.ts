// Shared types for the influencer admin feature

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
  metadata: Record<string, string> | null
  campaigns: InfluencerCampaign[]
  application_method: { value: number } | null
}
