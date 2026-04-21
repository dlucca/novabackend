// src/workflows/envia-create-fulfillment/index.ts
//
// Medusa workflow that quotes Envia carriers, generates the cheapest available
// shipping label, registers the fulfillment in Medusa, and sends a Slack notification
// — with automatic compensation: if Medusa fulfillment creation fails, the Envia
// label is cancelled to avoid an untracked charge.
//
// Triggered by: src/subscribers/envia-fulfillment.ts (order.payment_captured)

import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { fetchOrderForFulfillmentStep } from "./steps/fetch-order"
import { generateEnviaLabelStep } from "./steps/generate-label"
import { createMedusaFulfillmentStep } from "./steps/create-fulfillment"
import { notifySlackStep } from "./steps/notify-slack"

type EnviaFulfillmentInput = { orderId: string }

export const enviaCreateFulfillmentWorkflow = createWorkflow(
  "envia-create-fulfillment",
  (input: EnviaFulfillmentInput) => {
    const order = fetchOrderForFulfillmentStep(input)
    const label = generateEnviaLabelStep({ order })
    createMedusaFulfillmentStep({
      order,
      shipment: label.shipment,
      deliveryEstimate: label.deliveryEstimate,
      quotedCarrierCost: label.quotedCarrierCost,
    })
    notifySlackStep({ order, labelUrl: label.shipment.label })
    return new WorkflowResponse({ trackingNumber: label.shipment.trackingNumber })
  }
)
