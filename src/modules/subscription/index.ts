import SubscriptionModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const SUBSCRIPTION_MODULE = "subscriptionModuleService"

export default Module(SUBSCRIPTION_MODULE, {
  service: SubscriptionModuleService,
})
