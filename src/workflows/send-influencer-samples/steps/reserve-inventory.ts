// src/workflows/send-influencer-samples/steps/reserve-inventory.ts
//
// Real orders go through cart→checkout→payment, where Medusa reserves
// inventory automatically when the cart completes. Sample orders skip that
// flow entirely (created directly via orderService.createOrders), so no
// reservation exists when createOrderFulfillmentWorkflow runs — and that
// workflow throws "No stock reservation found for item ..." which kills the
// downstream Envia + email steps.
//
// This step bridges the gap: for each line item in the sample order, look
// up the variant's inventory_item_id, then create a ReservationItem at the
// warehouse location. Compensation deletes the reservations if anything
// downstream fails.

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type Input = {
  order_id: string
}

type CreatedReservation = { id: string }

export const reserveSampleInventoryStep = createStep(
  "reserve-sample-inventory",
  async ({ order_id }: Input, { container }) => {
    const inventoryService = container.resolve(Modules.INVENTORY)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve("logger")

    const locationId = process.env.MEDUSA_WAREHOUSE_LOCATION_ID
    if (!locationId) {
      throw new Error(
        "MEDUSA_WAREHOUSE_LOCATION_ID is not set — cannot reserve inventory for sample order"
      )
    }

    // Pull the order's line items + the inventory items linked to each
    // variant. The variant→inventory_items link is what tells us which
    // inventory record holds the stock for that variant at our warehouse.
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: order_id },
      fields: [
        "id",
        "items.id",
        "items.quantity",
        "items.variant_id",
        "items.variant.inventory_items.inventory.id",
        "items.variant.inventory_items.required_quantity",
      ],
    })

    const order = orders[0] as any
    if (!order) {
      throw new Error(`Order ${order_id} not found when reserving inventory`)
    }

    const reservationsToCreate: Array<{
      inventory_item_id: string
      location_id: string
      quantity: number
      line_item_id: string
    }> = []

    for (const item of order.items ?? []) {
      const inventoryItems = item.variant?.inventory_items ?? []
      if (!inventoryItems.length) {
        // Variant doesn't track inventory — skip. Real-world: should not
        // happen for our patches (all manage_inventory=true) but we don't
        // want to break for some edge variant.
        logger.warn(
          `[reserve-sample-inventory] No inventory items linked for line item ${item.id} (variant ${item.variant_id}) — skipping reservation`
        )
        continue
      }

      // A variant can theoretically map to multiple inventory items
      // (multi-component bundles). For our parches it's always 1:1 but we
      // handle the general case to be safe.
      for (const link of inventoryItems) {
        const required = Number(link.required_quantity ?? 1)
        reservationsToCreate.push({
          inventory_item_id: link.inventory?.id ?? link.id,
          location_id: locationId,
          quantity: Number(item.quantity ?? 1) * required,
          line_item_id: item.id,
        })
      }
    }

    if (!reservationsToCreate.length) {
      logger.warn(
        `[reserve-sample-inventory] Nothing to reserve for order ${order_id} (no variants tracked inventory)`
      )
      return new StepResponse([], [])
    }

    logger.info(
      `[reserve-sample-inventory] Reserving ${reservationsToCreate.length} item(s) at location ${locationId} for order ${order_id}`
    )

    let created: any[]
    try {
      created = await inventoryService.createReservationItems(
        reservationsToCreate as any
      )
    } catch (err) {
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
        `[reserve-sample-inventory] createReservationItems FAILED for order ${order_id}:\n${serialized}`
      )
      throw err
    }

    const compensation: CreatedReservation[] = created.map((r: any) => ({ id: r.id }))
    return new StepResponse(compensation, compensation)
  },
  // Compensation: delete the reservations we created. Best-effort — if
  // deletion fails, log so an operator can manually clean up.
  async (compensationData: CreatedReservation[] | undefined, { container }) => {
    if (!compensationData?.length) return
    const inventoryService = container.resolve(Modules.INVENTORY)
    const logger = container.resolve("logger")
    try {
      await inventoryService.deleteReservationItems(
        compensationData.map((r) => r.id)
      )
      logger.warn(
        `[reserve-sample-inventory] Compensation: released ${compensationData.length} reservation(s)`
      )
    } catch (err) {
      logger.error(
        `[reserve-sample-inventory] Compensation FAILED — manual cleanup may be required: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }
)
