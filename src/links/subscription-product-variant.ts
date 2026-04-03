import SubscriptionModule from "../modules/subscription"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  SubscriptionModule.linkable.subscription,
  ProductModule.linkable.productVariant
)
