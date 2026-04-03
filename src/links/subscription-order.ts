import SubscriptionModule from "../modules/subscription"
import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    linkable: SubscriptionModule.linkable.subscription,
    field: "original_order_id",
  },
  OrderModule.linkable.order,
  {
    readOnly: true,
  }
)
