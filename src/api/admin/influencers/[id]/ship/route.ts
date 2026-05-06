// src/api/admin/influencers/[id]/ship/route.ts
//
// POST /admin/influencers/:id/ship
//
// Triggers the sendInfluencerSamplesWorkflow for an approved application.
// Body is empty — the workflow reads the parches + address from the
// application itself, so admins can't accidentally ship a different set
// than what was approved.

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendInfluencerSamplesWorkflow } from "../../../../../workflows/send-influencer-samples"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const { result } = await sendInfluencerSamplesWorkflow(req.scope).run({
      input: { application_id: id },
    })
    return res.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Validation errors (status mismatch, no parches, etc.) — return 422
    // so the admin UI can show the message verbatim.
    if (
      /Estado actual|aprobadas|ya tiene una orden|no tiene parches|no tiene dirección|Variantes faltantes|No se encontraron variantes|no existe/i.test(
        message
      )
    ) {
      return res.status(422).json({ error: message })
    }
    return res.status(500).json({ error: message })
  }
}
