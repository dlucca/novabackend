import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../../modules/influencer"
import InfluencerModuleService from "../../../../modules/influencer/service"

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { estado } = req.body as { estado: string }

  const allowed = ["aprobado", "rechazado", "pendiente"]
  if (!estado || !allowed.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser uno de: ${allowed.join(", ")}` })
  }

  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  const [updated] = await influencerService.updateInfluencerApplications([
    { id, estado } as any,
  ])

  return res.json({ influencer_application: updated })
}
