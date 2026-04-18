import { MedusaService } from "@medusajs/framework/utils"
import { InfluencerApplication } from "./models/influencer-application"

class InfluencerModuleService extends MedusaService({
  InfluencerApplication,
}) {}

export default InfluencerModuleService
