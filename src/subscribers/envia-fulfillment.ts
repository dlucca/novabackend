// src/subscribers/envia-fulfillment.ts
//
// Triggers the Envia fulfillment workflow when an order's payment is captured.
// All business logic (rate quoting, label generation, compensation) lives in the
// workflow — this subscriber is intentionally kept thin.

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { enviaCreateFulfillmentWorkflow } from "../workflows/envia-create-fulfillment"

export default async function enviaFulfillmentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  // Skip gracefully if Envia is not configured (e.g. local dev without sandbox token)
  if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
    logger.warn(`[envia-fulfillment] ENVIA_API_TOKEN or ENVIA_API_URL not set — skipping order ${orderId}`)
    return
  }

  try {
    await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId } })
  } catch (err) {
    // RNF-01: never throw — the order stays as `paid`; an operator can create
    // the fulfillment manually. The workflow logs details of each failed step.
    logger.error(
      `[envia-fulfillment] Workflow failed for order ${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: {
    subscriberId: "envia-fulfillment",
  },
}
