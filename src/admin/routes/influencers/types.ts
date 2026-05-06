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

export type InfluencerAddress = {
  street?: string | null
  interior?: string | null
  colonia?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  instructions?: string | null
}

export type InfluencerApplication = {
  id: string
  nombre: string
  email: string
  pais: string
  // Legacy fields (nullable for new applications)
  red_principal: string | null
  handle: string | null
  handle_secundario: string | null
  link_perfil: string | null
  // New fields (current form)
  instagram_handle: string | null
  tiktok_handle: string | null
  rango_seguidores: string
  nicho: string[]
  tipo_contenido: string[]
  // Legacy fields (nullable for new applications)
  genero_audiencia: string | null
  edad_audiencia: string | null
  tiene_contenido_bienestar: string
  marcas_previas: string | null
  parches: string[]
  // Legacy field (nullable for new applications)
  modalidad: string[] | null
  media_kit: string | null
  media_kit_url: string | null
  mensaje_libre: string | null
  // New: shipping address (MX format)
  direccion: InfluencerAddress | null
  estado: "pendiente" | "aprobado" | "rechazado" | "enviado"
  // State-transition audit fields
  aprobado_en: string | null
  rechazado_en: string | null
  enviado_en: string | null
  motivo_rechazo: string | null
  pedido_id: string | null
  created_at: string
}
