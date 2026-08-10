import { MedusaService } from "@medusajs/framework/utils"
import { ProductReview } from "./models/product-review"

class ReviewModuleService extends MedusaService({
  ProductReview,
}) {}

export default ReviewModuleService
