// src/api/webhooks/envia/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import crypto from "node:crypto"
import Redis from "ioredis"
import * as React from "react"
import { sendEmail, renderEmail } from "../../../lib/resend"
import OrderDelivered from "../../../emails/OrderDelivered"
import OrderDeliveryFailed from "../../../emails/OrderDeliveryFailed"

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

// Lazy singleton Redis client — reused across requests
let redisClient: Redis | null = null
function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!redisClient) redisClient = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 })
  return redisClient
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
    // Find the fulfillment by scanning labels relation
    const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
    const fulfillments = await fulfillmentModule.listFulfillments(
      {},
      { relations: ["labels"] }
    )
    const match = fulfillments.find((f: any) =>
      f.labels?.some((l: any) => l.tracking_number === trackingNumber)
    )

    if (!match) {
      logger.warn(`[envia-webhook] No fulfillment found for tracking ${trackingNumber}`)
      return
    }

    const fulfillmentId = match.id
    const fulfillment = match

    // Update fulfillment metadata with the latest status
    await fulfillmentModule.updateFulfillment(fulfillmentId, {
      metadata: {
        ...(fulfillment.metadata ?? {}),
        envia_last_status: status,
        envia_last_event_at: new Date().toISOString(),
      },
    })

    logger.info(`[envia-webhook] Updated fulfillment ${fulfillmentId} status → ${status}`)

    if (status === "in_transit" || status === "delivered" || status === "failed" || status === "returned") {
      const orderId = fulfillment.metadata?.order_id as string | undefined

      if (!orderId) {
        logger.warn(`[envia-webhook] No order_id in fulfillment metadata for tracking ${trackingNumber} — skipping email`)
      } else {
        try {
          const orderService = container.resolve(Modules.ORDER)
          const order = await orderService.retrieveOrder(orderId, {
            relations: ["shipping_address"],
          }) as any

          const customerEmail = order?.email
          const customerName = order?.shipping_address?.first_name ?? "Cliente"
          const displayId = order?.display_id ?? orderId

          if (customerEmail) {
            if (status === "in_transit") {
              // Carrier picked up the package — now it's safe to tell the customer it's on its way.
              // Emit internal event so the order-shipped-email subscriber handles rendering/sending.
              const eventBus = container.resolve(Modules.EVENT_BUS)
              await eventBus.emit([{
                name: "novapatch.envia.in_transit",
                data: {
                  order_id: orderId,
                  fulfillment_id: fulfillmentId,
                  tracking_number: trackingNumber,
                },
              }])
              logger.info(`[envia-webhook] in_transit event emitted for order ${orderId}`)
            } else {
              let html: string
              let subject: string

              if (status === "delivered") {
                html = await renderEmail(
                  React.createElement(OrderDelivered, { name: customerName, displayId, trackingNumber })
                )
                subject = `Tu pedido #${displayId} fue entregado — Novapatch`
              } else {
                html = await renderEmail(
                  React.createElement(OrderDeliveryFailed, {
                    name: customerName,
                    displayId,
                    trackingNumber,
                    status: status as "failed" | "returned",
                  })
                )
                subject = `Problema con la entrega de tu pedido #${displayId} — Novapatch`
              }

              await sendEmail({ to: customerEmail, subject, html })
              logger.info(`[envia-webhook] Email de ${status} enviado a ${customerEmail} para orden #${displayId}`)
            }
          }
        } catch (emailErr) {
          // Never throw from webhook — 200 was already sent to Envia
          logger.error(
            `[envia-webhook] Failed to send ${status} email for tracking ${trackingNumber}: ${
              emailErr instanceof Error ? emailErr.message : String(emailErr)
            }`
          )
        }
      }
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
  const redis = getRedis()
  if (redis) {
    try {
      const key = `envia:webhook:dedup:${hash}`
      // NX = only set if not exists, EX = expire in 24h
      const set = await redis.set(key, "1", "EX", 86400, "NX")
      if (set === null) {
        // Key already existed — duplicate event
        const logger = (req as any).scope?.resolve?.("logger") ?? console
        logger.info?.(`[envia-webhook] Duplicate event skipped — hash ${hash.slice(0, 8)}`)
        return
      }
    } catch {
      // Redis unavailable — fall back to in-memory check
      if (isDuplicate(hash)) {
        const logger = (req as any).scope?.resolve?.("logger") ?? console
        logger.info?.(`[envia-webhook] Duplicate event skipped (in-memory) — hash ${hash.slice(0, 8)}`)
        return
      }
      processed.set(hash, Date.now() + DEDUP_TTL_MS)
    }
  } else {
    if (isDuplicate(hash)) {
      const logger = (req as any).scope?.resolve?.("logger") ?? console
      logger.info?.(`[envia-webhook] Duplicate event skipped (in-memory) — hash ${hash.slice(0, 8)}`)
      return
    }
    processed.set(hash, Date.now() + DEDUP_TTL_MS)
  }

  // Process asynchronously so the response is never blocked (RNF-03)
  const scope = (req as any).scope
  if (!scope) return
  setImmediate(() => processEvent(payload, scope))
}
