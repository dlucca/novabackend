// src/workflows/envia-create-fulfillment/steps/fetch-order.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

export const fetchOrderForFulfillmentStep = createStep(
  "fetch-order-for-fulfillment",
  async ({ orderId }: { orderId: string }, { container }) => {
    const orderService = container.resolve(Modules.ORDER)
    const order = await orderService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    })
    return new StepResponse(order as any)
  }
)
