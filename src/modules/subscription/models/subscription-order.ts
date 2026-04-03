import { model } from "@medusajs/framework/utils"
import { Subscription } from "./subscription"

export const SubscriptionOrder = model.define("subscription_order", {
  id: model.id().primaryKey(),
  cycle_number: model.number(),
  order_id: model.text(),
  subscription: model.belongsTo(() => Subscription, {
    mappedBy: "subscription_orders",
  }),
})

export default SubscriptionOrder
