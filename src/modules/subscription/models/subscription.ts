import { model } from "@medusajs/framework/utils"
import { SubscriptionOrder } from "./subscription-order"

export const SubscriptionStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELED: "canceled",
  PAST_DUE: "past_due",
  DELAYED_OUT_OF_STOCK: "delayed_out_of_stock",
} as const

export const Subscription = model.define("subscription", {
  id: model.id().primaryKey(),
  status: model.text().default("active"),
  interval_days: model.number(),
  next_billing_date: model.dateTime(),
  metadata: model.json().nullable(),
  subscription_orders: model.hasMany(() => SubscriptionOrder, {
    mappedBy: "subscription",
  }),
})

export default Subscription
