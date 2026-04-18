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
  used?: number
  campaign?: InfluencerCampaign | null
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
  return promo.campaign?.name?.startsWith("INF|") ?? false
}

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
