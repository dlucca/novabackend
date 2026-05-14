// src/api/admin/influencers/[id]/ship/route.ts
//
// POST /admin/influencers/:id/ship
//
// Ships free product samples to an approved influencer. The flow is
// intentionally minimal — no Medusa Order, no Customer, no Fulfillment,
// no Inventory reservation, no compensation chain. We just:
//
//   1. Acquire a Redis lock to block double-clicks / browser retries
//   2. Validate the application is approved and not already shipped
//   3. Call EnviaClient.generateShipment directly with the influencer's
//      address + the warehouse origin
//   4. Persist the tracking + label URL on the application
//   5. Emit influencer.samples-shipped → email subscriber sends the
//      warm shipping confirmation; no Order means no spurious order
//      events fire elsewhere
//   6. Notify Slack #orders with a sample-specific format
//
// The original design used the Medusa Order/Fulfillment pipeline + a
// 4-step workflow with compensation. That worked end-to-end for real
// orders but broke for samples in subtle ways (no shipping methods, no
// stock reservations, $0 line items confusing tax calculation) and
// introduced enough surface area that one Envia/FedEx duplicate-billing
// quirk turned into days of debugging. The simpler flow has fewer
// moving parts and only one external side effect.

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { INFLUENCER_MODULE } from "../../../../../modules/influencer"
import InfluencerModuleService from "../../../../../modules/influencer/service"
import { EnviaClient } from "../../../../../lib/envia-client"
import { buildShipmentRequest } from "../../../../../lib/envia-mappers"
import {
  guardShippableApplication,
  buildShipDestination,
  type ShippableApplication,
} from "./lib"
import { WAREHOUSE } from "../../../../../config/warehouse"
import {
  acquireInfluencerShipLock,
  releaseInfluencerShipLock,
} from "../../../../../lib/redis"
import { sendSlackNotification } from "../../../../../lib/slack-client"
import { mapInfluencerSampleShippedToSlackBlocks } from "../../../../../lib/slack-mappers"

type EnviaRateLite = {
  carrier: string
  service: string
  totalPrice: string
}

// Carriers we'll quote for sample shipments. FedEx is intentionally
// excluded — Envia + FedEx had a billing quirk during launch testing
// that produced phantom duplicate shipments. Sticking to MX-domestic
// carriers that work reliably for our package size (≤ 200g).
const SAMPLE_CARRIERS = ["paquetexpress", "ampm", "estafeta", "sendex"]

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const requestId = (req.headers["x-request-id"] as string) ?? Math.random().toString(36).slice(2, 10)
  const logger: any = (req.scope as any).resolve?.("logger") ?? console
  const log = (msg: string) => logger.info?.(`[ship-route ${requestId}] ${msg}`)
  const warn = (msg: string) => logger.warn?.(`[ship-route ${requestId}] ${msg}`)
  const err = (msg: string) => logger.error?.(`[ship-route ${requestId}] ${msg}`)

  // ── 1. Lock ────────────────────────────────────────────────────────────────
  log(`Attempting to acquire lock for application ${id}`)
  const acquired = await acquireInfluencerShipLock(id)
  if (!acquired) {
    warn(`Lock REJECTED for application ${id} — duplicate or in-flight request`)
    return res.status(409).json({
      error: "Ya hay un envío en curso para esta postulación. Esperá unos segundos y refrescá.",
    })
  }
  log(`Lock ACQUIRED for application ${id}`)

  try {
    // ── 2. Load + validate ──────────────────────────────────────────────────
    const influencerService: InfluencerModuleService = req.scope.resolve(INFLUENCER_MODULE)
    const application = await influencerService.retrieveInfluencerApplication(id) as any

    if (!application) {
      return res.status(404).json({ error: "Postulación no encontrada" })
    }

    const guard = guardShippableApplication(application as ShippableApplication)
    if (!guard.ok) {
      return res.status(guard.status).json({ error: guard.error })
    }

    if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
      return res.status(500).json({ error: "ENVIA no está configurado en este entorno" })
    }

    // ── 3. Compose Envia destination from the application's address ────────
    const parches: string[] = application.parches
    const fullName = (application.nombre as string).trim()
    const destination = buildShipDestination(application as ShippableApplication)

    log(`Destination: ${JSON.stringify(destination)}`)

    // ── 4. Quote sample carriers in parallel, pick cheapest ─────────────────
    const client = new EnviaClient()
    const items = parches.map((p) => ({
      title: p,
      quantity: 1,
      unit_price: 0, // declared value — kept low for samples
    }))

    const rateSettled = await Promise.allSettled(
      SAMPLE_CARRIERS.map((carrier) =>
        client.getRate(buildShipmentRequest(destination, items, { carrier }))
      )
    )
    rateSettled.forEach((r, i) => {
      if (r.status === "rejected") {
        warn(`Rate failed for "${SAMPLE_CARRIERS[i]}": ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      }
    })

    const sortedRates = rateSettled
      .map((r, i) => (r.status === "fulfilled" && r.value ? { ...r.value, carrier: r.value.carrier ?? SAMPLE_CARRIERS[i] } : null))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => parseFloat(a.totalPrice) - parseFloat(b.totalPrice))

    if (!sortedRates.length) {
      return res.status(502).json({
        error: "Ningún carrier devolvió cotización. Probá de nuevo en unos minutos.",
      })
    }

    // ── 5. Generate label, falling back to next cheapest if a carrier fails ─
    let shipment: Awaited<ReturnType<EnviaClient["generateShipment"]>> | null = null
    let winningRate: EnviaRateLite | null = null
    for (const rate of sortedRates) {
      log(`Trying ${rate.carrier}/${rate.service} at ${rate.totalPrice} ${rate.currency}`)
      try {
        shipment = await client.generateShipment(
          buildShipmentRequest(destination, items, { carrier: rate.carrier, service: rate.service })
        )
        winningRate = rate
        break
      } catch (e: any) {
        warn(`Generate failed for "${rate.carrier}": ${e?.message ?? e} — trying next`)
      }
    }

    if (!shipment || !winningRate) {
      return res.status(502).json({
        error: "Ningún carrier pudo generar la etiqueta. Reintentá o revisá la dirección.",
      })
    }

    log(`✓ Label generated — tracking=${shipment.trackingNumber} carrier=${shipment.carrier} shipmentId=${shipment.shipmentId}`)

    // ── 6. Persist on the application — best-effort cancel envia label if write fails
    try {
      await influencerService.updateInfluencerApplications([{
        id,
        estado: "enviado",
        enviado_en: new Date(),
        tracking_number: shipment.trackingNumber,
        label_url: shipment.label,
        carrier: shipment.carrier,
        envia_shipment_id: String(shipment.shipmentId),
      } as any])
    } catch (writeErr) {
      err(`Failed to persist tracking on application ${id} — cancelling Envia label to avoid orphan: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`)
      try {
        await client.cancelShipment({
          shipmentId: shipment.shipmentId,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
        })
      } catch (cancelErr) {
        err(`Cancellation also failed — manual void in Envia required for shipment ${shipment.shipmentId}: ${cancelErr instanceof Error ? cancelErr.message : String(cancelErr)}`)
      }
      throw writeErr
    }

    // ── 7. Emit event for the email subscriber ──────────────────────────────
    try {
      const eventBus = req.scope.resolve(Modules.EVENT_BUS)
      await eventBus.emit([{
        name: "influencer.samples-shipped",
        data: {
          application_id: id,
          customer_email: application.email,
          customer_name: fullName.split(/\s+/)[0] ?? "Hola",
          parches,
          tracking_number: shipment.trackingNumber,
          tracking_url: shipment.trackUrl,
          carrier: shipment.carrier,
        },
      }])
    } catch (eventErr) {
      // Non-fatal — the label is already generated. Log and continue so
      // the admin sees success.
      err(`Failed to emit influencer.samples-shipped event: ${eventErr instanceof Error ? eventErr.message : String(eventErr)}`)
    }

    // ── 8. Slack notification ───────────────────────────────────────────────
    const slackWebhook = process.env.SLACK_ORDERS_WEBHOOK_URL
    if (slackWebhook) {
      try {
        const blocks = mapInfluencerSampleShippedToSlackBlocks({
          nombre: application.nombre,
          email: application.email,
          instagramHandle: application.instagram_handle ?? null,
          tiktokHandle: application.tiktok_handle ?? null,
          parches,
          trackingNumber: shipment.trackingNumber,
          carrier: shipment.carrier,
          labelUrl: shipment.label,
          trackUrl: shipment.trackUrl,
        })
        await sendSlackNotification(slackWebhook, blocks)
      } catch (slackErr) {
        // Non-fatal — log and continue.
        err(`Slack notification failed: ${slackErr instanceof Error ? slackErr.message : String(slackErr)}`)
      }
    }

    return res.json({
      success: true,
      application_id: id,
      tracking_number: shipment.trackingNumber,
      tracking_url: shipment.trackUrl,
      label_url: shipment.label,
      carrier: shipment.carrier,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    err(`Unexpected error: ${message}`)
    return res.status(500).json({ error: message })
  } finally {
    await releaseInfluencerShipLock(id)
    log(`Lock RELEASED for application ${id}`)
  }
}
