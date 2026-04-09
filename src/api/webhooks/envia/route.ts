// src/api/webhooks/envia/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import crypto from "node:crypto"

// In-memory deduplication store: hash → expires-at timestamp
const processed = new Map<string, number>()
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000

function eventHash(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
}

function isDuplicate(hash: string): boolean {
  const expiresAt = processed.get(hash)
  if (expiresAt === undefined) return false
  if (Date.now() > expiresAt) {
    processed.delete(hash)
    return false
  }
  return true
}

type EnviaWebhookPayload = {
  trackingNumber: string
  status: "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returned"
  carrierName?: string
  events?: Array<{ timestamp: string; description: string; location?: string }>
}

async function processEvent(
  payload: EnviaWebhookPayload,
  container: any
): Promise<void> {
  const logger = container.resolve("logger")
  const { trackingNumber, status } = payload

  logger.info(`[envia-webhook] trackingNumber=${trackingNumber} status=${status}`)

  try {
    // Find the fulfillment label by tracking number
    const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
    // NOTE: listFulfillmentLabels may not be in the official type definitions yet;
    // using `as any` to bridge the type gap until Medusa v2 exposes it.
    const labels = await (fulfillmentModule as any).listFulfillmentLabels({ tracking_number: trackingNumber })

    if (!labels || labels.length === 0) {
      logger.warn(`[envia-webhook] No fulfillment found for tracking ${trackingNumber}`)
      return
    }

    const fulfillmentId = labels[0].fulfillment_id
    const fulfillment = await fulfillmentModule.retrieveFulfillment(fulfillmentId)

    // Update fulfillment metadata with the latest status
    await fulfillmentModule.updateFulfillment(fulfillmentId, {
      metadata: {
        ...(fulfillment.metadata ?? {}),
        envia_last_status: status,
        envia_last_event_at: new Date().toISOString(),
      },
    })

    logger.info(`[envia-webhook] Updated fulfillment ${fulfillmentId} status → ${status}`)

    if (status === "delivered") {
      logger.info(`[envia-webhook] Order delivered — tracking ${trackingNumber}`)
    } else if (status === "failed" || status === "returned") {
      logger.warn(
        `[envia-webhook] Shipment issue (${status}) for tracking ${trackingNumber} — manual review required`
      )
    }
  } catch (err) {
    logger.error(
      `[envia-webhook] Error processing event for ${trackingNumber}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Respond 200 immediately — Envia requires < 5s (RNF-03)
  res.status(200).json({ received: true })

  const payload = req.body as EnviaWebhookPayload

  if (!payload?.trackingNumber) return

  // Idempotency: skip duplicate events (RNF-04)
  const hash = eventHash(payload)
  if (isDuplicate(hash)) {
    const logger = (req as any).scope?.resolve?.("logger") ?? console
    logger.info?.(`[envia-webhook] Duplicate event skipped — hash ${hash.slice(0, 8)}`)
    return
  }
  processed.set(hash, Date.now() + DEDUP_TTL_MS)

  // Process asynchronously so the response is never blocked (RNF-03)
  const scope = (req as any).scope
  if (!scope) return
  setImmediate(() => processEvent(payload, scope))
}
