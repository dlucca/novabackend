// src/workflows/send-influencer-samples/steps/finalize-shipment.ts
//
// Fires Envia to generate the real label, then marks the application as
// shipped and emits an event for the email subscriber.
//
// Failure modes:
//   - If Envia creation fails → we rethrow so the workflow compensates the
//     prior steps (delete order, undo customer if we created it). The
//     application stays "approved" so the admin can retry.
//   - If application update fails AFTER Envia label exists → we log and
//     emit anyway. The order/label are real, the email goes out, but the
//     audit trail in our DB is missing the order_id link. An operator can
//     fix the row manually. We don't roll back the label because cancelling
//     it just to retry the DB write would create a worse outcome (charged
//     label and no email).

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { enviaCreateFulfillmentWorkflow } from "../../envia-create-fulfillment"
import { INFLUENCER_MODULE } from "../../../modules/influencer"
import InfluencerModuleService from "../../../modules/influencer/service"
import type { ValidatedSampleData } from "./validate-and-prepare"

type Input = {
  data: ValidatedSampleData
  order_id: string
}

export const finalizeShipmentStep = createStep(
  "finalize-shipment",
  async ({ data, order_id }: Input, { container }) => {
    const influencerService: InfluencerModuleService = container.resolve(INFLUENCER_MODULE)
    const eventBus = container.resolve(Modules.EVENT_BUS)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve("logger")

    // 1) Fire Envia. If this throws, the workflow rolls back the order.
    if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
      throw new Error(
        "ENVIA_API_TOKEN/URL no están configurados — no se puede generar la etiqueta"
      )
    }

    // Cast to any so TS lets us read `trackingNumber` off the result without
    // unwrapping the deeply-nested workflow generic. The shape is verified
    // at runtime below.
    let enviaResult: any
    try {
      enviaResult = await enviaCreateFulfillmentWorkflow(container).run({
        input: { orderId: order_id },
      })
    } catch (err) {
      // Surface the underlying failure clearly so we can diagnose without
      // having to grep across multiple log streams. Re-throw to trigger
      // compensation (which cancels the Envia label if one was created).
      let serialized: string
      if (err instanceof Error) {
        serialized = `${err.message}${err.stack ? `\n${err.stack}` : ""}`
      } else {
        try {
          serialized = JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}), 2)
        } catch {
          serialized = String(err)
        }
      }
      logger.error(
        `[send-influencer-samples] enviaCreateFulfillmentWorkflow failed for order ${order_id} ` +
        `(application ${data.application_id}):\n${serialized}`
      )
      throw err
    }

    const trackingNumber = enviaResult.result?.trackingNumber
    if (!trackingNumber) {
      logger.error(
        `[send-influencer-samples] No tracking number in envia result for order ${order_id} — ` +
        `result was: ${JSON.stringify(enviaResult.result)}`
      )
      throw new Error("Envia no devolvió tracking number")
    }

    // 2) Look up the carrier + tracking URL we just persisted on the
    //    fulfillment, so the email has accurate data.
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: order_id },
      fields: [
        "id",
        "display_id",
        "fulfillments.id",
        "fulfillments.metadata",
        "fulfillments.labels.tracking_number",
        "fulfillments.labels.tracking_url",
      ],
    })

    const order = orders[0] as any
    const fulfillment = order?.fulfillments?.[order.fulfillments.length - 1]
    const label = fulfillment?.labels?.[0]
    const carrier = (fulfillment?.metadata?.carrier as string) ?? "carrier"
    const trackingUrl =
      (label?.tracking_url as string) ??
      `https://www.envia.com/Tracking/Index?guide=${trackingNumber}`

    // 3) Mark the application as shipped + linked to the order. Best-effort —
    //    if this fails the label is already real, so we just log and continue.
    try {
      await influencerService.updateInfluencerApplications([{
        id: data.application_id,
        estado: "enviado",
        enviado_en: new Date(),
        pedido_id: order_id,
      } as any])
    } catch (err) {
      logger.error(
        `[send-influencer-samples] Application update failed after shipment created for ${order_id}: ` +
        (err instanceof Error ? err.message : String(err))
      )
    }

    // 4) Emit the warm-email event. The subscriber owns rendering + sending.
    await eventBus.emit([{
      name: "influencer.samples-shipped",
      data: {
        application_id: data.application_id,
        order_id,
        order_display_id: order?.display_id ?? null,
        customer_email: data.customer_email,
        customer_name: data.customer_first_name,
        parches: data.parches,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        carrier,
      },
    }])

    logger.info(
      `[send-influencer-samples] ✓ Sample shipment complete — application=${data.application_id} ` +
      `order=${order_id} tracking=${trackingNumber}`
    )

    return new StepResponse({
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      carrier,
    })
  }
)
