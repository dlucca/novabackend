import ReviewModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const REVIEW_MODULE = "reviewModuleService"

export default Module(REVIEW_MODULE, {
  service: ReviewModuleService,
})
