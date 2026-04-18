import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INFLUENCER_MODULE } from "../../../modules/influencer"
import InfluencerModuleService from "../../../modules/influencer/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)

  const { estado, limit = "50", offset = "0" } = req.query as Record<string, string>

  const filters: Record<string, unknown> = {}
  if (estado) filters.estado = estado

  const [applications, count] = await influencerService.listAndCountInfluencerApplications(
    filters,
    { take: parseInt(limit), skip: parseInt(offset), order: { created_at: "DESC" } }
  )

  return res.json({ influencer_applications: applications, count })
}
