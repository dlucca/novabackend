import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import ReviewModuleService from "../../../../modules/review/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const { slug } = req.query as Record<string, string>

  const filters: any = {}
  if (slug) {
    filters.product_slug = slug
  }

  const reviews = await reviewService.listProductReviews(filters, {
    order: { created_at: "DESC" }
  })

  return res.status(200).json(reviews)
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const body = req.body as any

  if (!body.product_slug || !body.user_name || !body.rating || !body.title) {
    return res.status(400).json({ error: "Faltan campos obligatorios" })
  }

  const [newReview] = await reviewService.createProductReviews([
    {
      product_slug: body.product_slug,
      user_name: body.user_name,
      user_email: body.user_email || "",
      clerk_user_id: body.clerk_user_id || "",
      rating: Number(body.rating),
      title: body.title,
      comment: body.comment || null,
    }
  ])

  return res.status(201).json(newReview)
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const body = req.body as any

  if (!body.id || !body.reply) {
    return res.status(400).json({ error: "Faltan campos obligatorios" })
  }

  const [updatedReview] = await reviewService.updateProductReviews([
    {
      id: body.id,
      reply: body.reply,
      reply_created_at: new Date(),
    }
  ])

  return res.status(200).json(updatedReview)
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const { id } = req.query as Record<string, string>

  if (!id) {
    return res.status(400).json({ error: "Falta ID de opinión" })
  }

  await reviewService.deleteProductReviews(id)

  return res.status(200).json({ success: true })
}
