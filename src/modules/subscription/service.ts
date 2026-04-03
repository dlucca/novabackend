import { MedusaService } from "@medusajs/framework/utils"
import { Subscription } from "./models/subscription"
import { SubscriptionOrder } from "./models/subscription-order"

class SubscriptionModuleService extends MedusaService({
  Subscription,
  SubscriptionOrder,
}) {}

export default SubscriptionModuleService
