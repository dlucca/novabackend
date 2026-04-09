// Debug: shows exactly what payload would be sent to Envia generate
import { Modules } from "@medusajs/framework/utils"
import { mapAddress, buildShipmentRequest } from "../lib/envia-mappers"

export default async function({ container }: { container: any }) {
  const orderId = process.env.ORDER_ID!
  const orderService = container.resolve(Modules.ORDER)
  const order = await orderService.retrieveOrder(orderId, {
    relations: ["items", "shipping_address"],
  }) as any

  console.log("\n--- Raw shipping_address from Medusa ---")
  console.log(JSON.stringify(order.shipping_address, null, 2))

  const destination = mapAddress(order.shipping_address)
  console.log("\n--- Mapped EnviaAddress ---")
  console.log(JSON.stringify(destination, null, 2))

  const req = buildShipmentRequest(destination, order.items ?? [], {
    carrier: "dhl",
    service: "express",
  })
  console.log("\n--- Full generate payload ---")
  console.log(JSON.stringify(req, null, 2))
}
