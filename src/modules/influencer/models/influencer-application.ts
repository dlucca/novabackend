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
  red_principal: model.text(),
  handle: model.text(),
  handle_secundario: model.text().nullable(),
  link_perfil: model.text(),

  // Step 2 — community & content
  rango_seguidores: model.text(),
  nicho: model.json(),
  tipo_contenido: model.json(),
  genero_audiencia: model.text(),
  edad_audiencia: model.text(),
  tiene_contenido_bienestar: model.text(),
  marcas_previas: model.text().nullable(),

  // Step 3 — fit with Novapatch
  parches: model.json(),
  modalidad: model.json(),
  media_kit: model.text().nullable(),
  media_kit_url: model.text().nullable(),
  mensaje_libre: model.text().nullable(),

  // Meta
  estado: model.text().default("pendiente"),
})

export default InfluencerApplication
