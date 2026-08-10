import { model } from "@medusajs/framework/utils"

export const ProductReview = model.define("product_review", {
  id: model.id().primaryKey(),
  product_slug: model.text(),
  user_name: model.text(),
  user_email: model.text(),
  clerk_user_id: model.text(),
  rating: model.number(),
  title: model.text(),
  comment: model.text().nullable(),
  reply: model.text().nullable(),
  reply_created_at: model.dateTime().nullable(),
})

export default ProductReview
