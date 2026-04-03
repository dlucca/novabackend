import SubscriptionModule from "../modules/subscription"
import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  {
    linkable: SubscriptionModule.linkable.subscriptionOrder,
    field: "order_id",
  },
  OrderModule.linkable.order,
  {
    readOnly: true,
  }
)
