// src/workflows/send-influencer-samples/steps/create-sample-order.ts
//
// Creates a Medusa order for the samples — all line items at $0. Marked with
// metadata.is_sample=true so dashboards / reports can filter these out from
// real revenue.
//
// Compensation deletes the order if a later step fails. We don't need to
// roll back inventory because Medusa handles that on order delete.

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { ValidatedSampleData } from "./validate-and-prepare"

type Input = {
  data: ValidatedSampleData
  customer_id: string
}

export type CreatedSampleOrder = { order_id: string }

export const createSampleOrderStep = createStep(
  "create-sample-order",
  async ({ data, customer_id }: Input, { container }) => {
    const orderService = container.resolve(Modules.ORDER)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve("logger")

    // Resolve the default sales channel + region. Samples ride on the same
    // channel as real orders — separation is purely metadata-based for now.
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "name", "is_disabled"],
    })
    const channel = channels.find((c: any) => !c.is_disabled) ?? channels[0]

    const { data: regions } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code", "countries.iso_2"],
    })
    const mxRegion =
      regions.find((r: any) =>
        r.countries?.some((c: any) => c.iso_2 === "mx")
      ) ?? regions[0]

    if (!channel?.id || !mxRegion?.id) {
      throw new Error(
        `No se pudo resolver sales channel o región (channel=${channel?.id}, region=${mxRegion?.id})`
      )
    }

    const [order] = await orderService.createOrders([{
      currency_code: mxRegion.currency_code ?? "mxn",
      region_id: mxRegion.id,
      customer_id,
      email: data.customer_email,
      sales_channel_id: channel.id,
      shipping_address: data.shipping_address,
      items: data.line_items,
      metadata: {
        is_sample: true,
        sample_for_application: data.application_id,
        // Tag the source so the regular order-shipped email subscriber can
        // skip these and let our influencer-specific subscriber handle it.
        source: "influencer-sample",
      },
      status: "pending",
    }])

    logger.info(
      `[send-influencer-samples] Sample order ${order.id} created for application ${data.application_id} ` +
      `(${data.line_items.length} parches, customer=${customer_id})`
    )

    return new StepResponse<CreatedSampleOrder, { order_id: string }>(
      { order_id: order.id },
      { order_id: order.id }
    )
  },
  async (compensationData, { container }) => {
    if (!compensationData?.order_id) return
    const orderService = container.resolve(Modules.ORDER)
    const logger = container.resolve("logger")
    try {
      // Soft-delete via deleteOrders. If Envia already created a label for
      // this order, the cancel-shipment compensation in Envia's own workflow
      // handles voiding it.
      await orderService.deleteOrders(compensationData.order_id)
      logger.warn(
        `[send-influencer-samples] Compensation: deleted sample order ${compensationData.order_id}`
      )
    } catch (err) {
      logger.error(
        `[send-influencer-samples] Compensation failed for order ${compensationData.order_id}: ` +
        (err instanceof Error ? err.message : String(err))
      )
    }
  }
)
