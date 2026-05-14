import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../modules/influencer"
import InfluencerModuleService from "../../../modules/influencer/service"
import { sendSlackNotification } from "../../../lib/slack-client"
import { mapInfluencerApplicationToSlackBlocks } from "../../../lib/slack-mappers"
import { validateInfluencerPayload } from "../../../lib/influencer-validation"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as Record<string, unknown>

  const validation = validateInfluencerPayload(body)
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error })
  }

  // Validator guarantees both required fields above and at least one handle.
  const instagramHandle = (body.instagram_handle as string)?.trim() || null
  const tiktokHandle = (body.tiktok_handle as string)?.trim() || null

  // Derive legacy red_principal / handle from whichever handle is present so
  // existing admin views and Slack mappers keep working without changes.
  const redPrincipal = instagramHandle ? "instagram" : "tiktok"
  const primaryHandle = instagramHandle ?? tiktokHandle ?? ""

  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  const [application] = await influencerService.createInfluencerApplications([
    {
      nombre: body.nombre as string,
      email: body.email as string,
      telefono: body.telefono as string,
      pais: body.pais as string,
      red_principal: redPrincipal,
      handle: primaryHandle,
      handle_secundario: null,
      link_perfil: null,
      instagram_handle: instagramHandle,
      tiktok_handle: tiktokHandle,
      rango_seguidores: body.rango_seguidores as string,
      nicho: body.nicho as string[],
      tipo_contenido: body.tipo_contenido as string[],
      genero_audiencia: null,
      edad_audiencia: null,
      tiene_contenido_bienestar: body.tiene_contenido_bienestar as string,
      marcas_previas: (body.marcas_previas as string) || null,
      parches: body.parches as string[],
      modalidad: null,
      media_kit: (body.media_kit as string) || null,
      media_kit_url: (body.media_kit_url as string) || null,
      mensaje_libre: (body.mensaje_libre as string) || null,
      direccion: (body.direccion as Record<string, unknown>) ?? null,
      estado: "pendiente",
    } as any,
  ])

  const webhookUrl = process.env.SLACK_INFLUENCER_WEBHOOK_URL
  if (webhookUrl) {
    const blocks = mapInfluencerApplicationToSlackBlocks({
      nombre: application.nombre,
      email: application.email,
      pais: application.pais,
      red_principal: application.red_principal,
      handle: application.handle,
      instagram_handle: (application as any).instagram_handle ?? null,
      tiktok_handle: (application as any).tiktok_handle ?? null,
      rango_seguidores: application.rango_seguidores,
      nicho: application.nicho as unknown as string[],
      parches: application.parches as unknown as string[],
    })
    sendSlackNotification(webhookUrl, blocks).catch((err) =>
      console.error("Slack influencer notification failed:", err)
    )
  }

  return res.status(201).json({ success: true, id: application.id })
}
