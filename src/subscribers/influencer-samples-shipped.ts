// src/subscribers/influencer-samples-shipped.ts
//
// Listens to influencer.samples-shipped (emitted by the simplified
// /admin/influencers/:id/ship route) and sends the warm shipping
// confirmation email via Resend.

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import InfluencerSamplesShipped from "../emails/InfluencerSamplesShipped"

type EventData = {
  application_id: string
  customer_email: string
  customer_name: string
  parches: string[]
  tracking_number: string
  tracking_url: string
  carrier: string
}

export default async function influencerSamplesShippedHandler({
  event,
  container,
}: SubscriberArgs<EventData>) {
  const logger = container.resolve("logger")
  const data = event.data

  if (!data?.customer_email) {
    logger.warn(
      `[influencer-samples-shipped] Missing email for application ${data?.application_id} — skipping`
    )
    return
  }

  try {
    const html = await renderEmail(
      React.createElement(InfluencerSamplesShipped as any, {
        name: data.customer_name,
        parches: data.parches,
        trackingNumber: data.tracking_number,
        trackingUrl: data.tracking_url,
        carrier: data.carrier,
      })
    )

    await sendEmail({
      to: data.customer_email,
      subject: "¡Tus muestras Novapatch están en camino!",
      html,
    })

    logger.info(
      `[influencer-samples-shipped] Email sent to ${data.customer_email} for application ${data.application_id}`
    )
  } catch (err) {
    // Best-effort: don't throw, the order/label are already real.
    logger.error(
      `[influencer-samples-shipped] Failed to send email for ${data.application_id}: ` +
      (err instanceof Error ? err.message : String(err))
    )
  }
}

export const config: SubscriberConfig = {
  event: "influencer.samples-shipped",
  context: {
    subscriberId: "influencer-samples-shipped",
  },
}
