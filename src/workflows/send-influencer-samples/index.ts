// src/workflows/send-influencer-samples/index.ts
//
// Orchestrator for shipping free product samples to an approved influencer.
//
// Steps (each with compensation where state changes):
//   1. validate-and-prepare        — load app, resolve patch variants, build line items
//   2. upsert-customer             — get-or-create customer for the influencer's email
//   3. create-sample-order         — Medusa order, all items at $0
//   4. finalize-shipment           — Envia label + mark application shipped + emit email event
//
// Triggered by: POST /admin/influencers/:id/ship

import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { validateAndPrepareStep } from "./steps/validate-and-prepare"
import { upsertCustomerStep } from "./steps/upsert-customer"
import { createSampleOrderStep } from "./steps/create-sample-order"
import { finalizeShipmentStep } from "./steps/finalize-shipment"

type Input = { application_id: string }

export const sendInfluencerSamplesWorkflow = createWorkflow(
  "send-influencer-samples",
  ({ application_id }: Input) => {
    const data = validateAndPrepareStep({ application_id })
    const customer = upsertCustomerStep({ data })
    const order = createSampleOrderStep({ data, customer_id: customer.customer_id })
    const shipment = finalizeShipmentStep({ data, order_id: order.order_id })

    return new WorkflowResponse({
      application_id,
      order_id: order.order_id,
      tracking_number: shipment.tracking_number,
      tracking_url: shipment.tracking_url,
      carrier: shipment.carrier,
    })
  }
)
