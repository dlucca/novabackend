import { Modules } from "@medusajs/framework/utils"

export default async function({ container }: { container: any }) {
  const orderId = process.env.ORDER_ID!
  const orderService = container.resolve(Modules.ORDER)
  const order = await orderService.retrieveOrder(orderId, {
    relations: ["items", "shipping_address"],
  }) as any
  console.log("shipping_address:", JSON.stringify(order.shipping_address, null, 2))
  console.log("items count:", order.items?.length)
  console.log("items:", JSON.stringify(order.items?.map((i: any) => ({
    title: i.title,
    quantity: i.quantity,
    unit_price: i.unit_price,
    subtotal: i.subtotal,
    total: i.total,
    metadata: i.metadata,
  })), null, 2))
  console.log("order total:", order.total)
  console.log("order subtotal:", order.subtotal)
  console.log("shipping total:", order.shipping_total)
  console.log("currency:", order.currency_code)
}
