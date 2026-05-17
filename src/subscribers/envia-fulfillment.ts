import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { enviaCreateFulfillmentWorkflow } from "../workflows/envia-create-fulfillment"

export default async function enviaFulfillmentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  if (!process.env.ENVIA_API_TOKEN || !process.env.ENVIA_API_URL) {
    logger.warn(`[envia-fulfillment] ENVIA_API_TOKEN or ENVIA_API_URL not set — skipping order ${orderId}`)
    return
  }

  // Smoke test guard: orders flagged with metadata.smoke_test = true are
  // synthetic transactions used by the weekly L4 smoke. They MUST NOT
  // generate a real Envia label (would cost ~$80-130 MXN per run).
  // See docs/superpowers/specs/2026-05-17-smoke-l4-full-checkout-design.md
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ["id", "metadata"],
    })
    const order = orders?.[0]
    if ((order?.metadata as any)?.smoke_test === true) {
      logger.info(`[envia-fulfillment] Skipping smoke test order ${orderId} (metadata.smoke_test=true)`)
      return
    }
  } catch (metaErr) {
    // If metadata check fails, fall through to the existing flow rather than
    // blocking real fulfillments. Worst case: a smoke order generates a label
    // and we cancel it manually in Envia.
    logger.warn(`[envia-fulfillment] Could not check metadata for order ${orderId}: ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`)
  }

  // Idempotency: skip if a fulfillment was already created for this order
  // (guards against duplicate order.payment_captured events)
  try {
    const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
    // Cast to any: order_id is a valid runtime filter but not in FilterableFulfillmentProps types
    const existing = await fulfillmentModule.listFulfillments({ order_id: orderId } as any)
    if (existing.length > 0) {
      logger.info(`[envia-fulfillment] Fulfillment already exists for order ${orderId} — skipping`)
      return
    }
  } catch (checkErr) {
    logger.warn(`[envia-fulfillment] Could not check existing fulfillments for order ${orderId}: ${checkErr instanceof Error ? checkErr.message : String(checkErr)}`)
  }

  try {
    await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId } })
  } catch (err) {
    let errMsg: string
    if (err instanceof Error) {
      errMsg = err.message
    } else {
      try { errMsg = JSON.stringify(err) } catch { errMsg = String(err) }
    }
    logger.error(`[envia-fulfillment] Workflow failed for order ${orderId}: ${errMsg}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
  context: {
    subscriberId: "envia-fulfillment",
  },
}
