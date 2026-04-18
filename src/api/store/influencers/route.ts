import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../modules/influencer"
import InfluencerModuleService from "../../../modules/influencer/service"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as Record<string, unknown>

  const required = ["nombre", "email", "pais", "red_principal", "handle", "link_perfil",
    "rango_seguidores", "nicho", "tipo_contenido", "genero_audiencia", "edad_audiencia",
    "tiene_contenido_bienestar", "parches", "modalidad"]

  for (const field of required) {
    if (!body[field]) {
      return res.status(400).json({ error: `Campo requerido: ${field}` })
    }
  }

  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  const [application] = await influencerService.createInfluencerApplications([
    {
      nombre: body.nombre as string,
      email: body.email as string,
      pais: body.pais as string,
      red_principal: body.red_principal as string,
      handle: body.handle as string,
      handle_secundario: (body.handle_secundario as string) || null,
      link_perfil: body.link_perfil as string,
      rango_seguidores: body.rango_seguidores as string,
      nicho: body.nicho as string[],
      tipo_contenido: body.tipo_contenido as string[],
      genero_audiencia: body.genero_audiencia as string,
      edad_audiencia: body.edad_audiencia as string,
      tiene_contenido_bienestar: body.tiene_contenido_bienestar as string,
      marcas_previas: (body.marcas_previas as string) || null,
      parches: body.parches as string[],
      modalidad: body.modalidad as string[],
      media_kit: (body.media_kit as string) || null,
      media_kit_url: (body.media_kit_url as string) || null,
      mensaje_libre: (body.mensaje_libre as string) || null,
      estado: "pendiente",
    } as any,
  ])

  return res.status(201).json({ success: true, id: application.id })
}
