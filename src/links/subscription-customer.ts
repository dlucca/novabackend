import SubscriptionModule from "../modules/subscription"
import CustomerModule from "@medusajs/medusa/customer"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  CustomerModule.linkable.customer,
  {
    linkable: SubscriptionModule.linkable.subscription,
    isList: true,
  }
)
