import { model } from "@medusajs/framework/utils"

export const InfluencerApplicationStatus = {
  PENDIENTE: "pendiente",
  EN_REVISION: "en_revision",
  APROBADO: "aprobado",
  RECHAZADO: "rechazado",
} as const

export const InfluencerApplication = model.define("influencer_application", {
  id: model.id().primaryKey(),

  // Step 1 — identity
  nombre: model.text(),
  email: model.text(),
  pais: model.text(),
  // Legacy single-network fields — kept for backwards compatibility with old
  // applications. New applications populate instagram_handle / tiktok_handle.
  red_principal: model.text().nullable(),
  handle: model.text().nullable(),
  handle_secundario: model.text().nullable(),
  link_perfil: model.text().nullable(),
  // New: at least one of instagram_handle / tiktok_handle is provided.
  instagram_handle: model.text().nullable(),
  tiktok_handle: model.text().nullable(),

  // Step 2 — community & content
  rango_seguidores: model.text(),
  nicho: model.json(),
  tipo_contenido: model.json(),
  // Removed from new form (kept nullable for old applications).
  genero_audiencia: model.text().nullable(),
  edad_audiencia: model.text().nullable(),
  tiene_contenido_bienestar: model.text(),
  marcas_previas: model.text().nullable(),

  // Step 3 — fit with Novapatch
  parches: model.json(),
  // Removed from new form (kept nullable for old applications).
  modalidad: model.json().nullable(),
  media_kit: model.text().nullable(),
  media_kit_url: model.text().nullable(),
  mensaje_libre: model.text().nullable(),
  // New: shipping address (Mexico format). Stored as JSON to keep the table
  // schema stable as we evolve the address shape per region.
  // { street, interior, colonia, city, state, zip, instructions }
  direccion: model.json().nullable(),

  // Meta
  estado: model.text().default("pendiente"),
})

export default InfluencerApplication
