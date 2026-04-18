import InfluencerModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const INFLUENCER_MODULE = "influencerModuleService"

export default Module(INFLUENCER_MODULE, {
  service: InfluencerModuleService,
})
