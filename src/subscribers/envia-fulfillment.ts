import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
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

  // Idempotency: skip if a fulfillment was already created for this order
  // (guards against duplicate order.payment_captured events)
  try {
    const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
    const existing = await fulfillmentModule.listFulfillments({ order_id: orderId })
    if (existing.length > 0) {
      logger.info(`[envia-fulfillment] Fulfillment already exists for order ${orderId} — skipping`)
      return
    }
  } catch (checkErr) {
    // If the check fails, proceed anyway — worst case is a duplicate label that ops can void
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
