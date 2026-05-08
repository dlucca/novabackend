// src/api/admin/influencers/[id]/ship/route.ts
//
// POST /admin/influencers/:id/ship
//
// Triggers the sendInfluencerSamplesWorkflow for an approved application.
// Body is empty — the workflow reads the parches + address from the
// application itself, so admins can't accidentally ship a different set
// than what was approved.
//
// Idempotency: a Redis lock prevents the same application from generating
// multiple Envia labels if the user double-clicks or the browser retries.
// The lock is held for the duration of the workflow + 5-min TTL safety.

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendInfluencerSamplesWorkflow } from "../../../../../workflows/send-influencer-samples"
import {
  acquireInfluencerShipLock,
  releaseInfluencerShipLock,
} from "../../../../../lib/redis"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  // Atomic SET NX — first request wins, others bounce off. We want this
  // BEFORE the workflow starts so we don't even create a Medusa order on
  // a duplicate request.
  const requestId = req.headers["x-request-id"] ?? Math.random().toString(36).slice(2, 10)
  const logger: any = (req.scope as any).resolve?.("logger") ?? console
  const logPrefix = `[ship-route ${requestId}]`

  logger.info(`${logPrefix} Attempting to acquire lock for application ${id}`)
  const acquired = await acquireInfluencerShipLock(id)
  if (!acquired) {
    logger.warn(`${logPrefix} Lock REJECTED for application ${id} — duplicate or in-flight request`)
    return res.status(409).json({
      error: "Ya hay un envío en curso para esta postulación. Esperá unos segundos y refrescá.",
    })
  }
  logger.info(`${logPrefix} Lock ACQUIRED for application ${id} — running workflow`)

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
  } finally {
    // Release the lock no matter what — success, validation failure, or
    // hard error. If the workflow crashed in a way that prevented release,
    // the 5-min TTL will eventually clean it up.
    await releaseInfluencerShipLock(id)
    logger.info(`${logPrefix} Lock RELEASED for application ${id}`)
  }
}
