// src/workflows/send-influencer-samples/steps/upsert-customer.ts
//
// Idempotent customer creation by email. We look up first; if no customer
// exists for this email we create one. Compensation deletes the customer
// only if WE created it — never an existing one (someone else might be using
// it as a real account).

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import type { ValidatedSampleData } from "./validate-and-prepare"

type Input = { data: ValidatedSampleData }

export type UpsertedCustomer = {
  customer_id: string
  created_now: boolean
}

export const upsertCustomerStep = createStep(
  "upsert-customer",
  async ({ data }: Input, { container }) => {
    const customerService = container.resolve(Modules.CUSTOMER)

    const existing = await customerService.listCustomers({
      email: data.customer_email,
    })

    if (existing.length) {
      return new StepResponse<UpsertedCustomer, { customer_id: string; created_now: boolean }>(
        { customer_id: existing[0].id, created_now: false },
        { customer_id: existing[0].id, created_now: false }
      )
    }

    const [created] = await customerService.createCustomers([{
      email: data.customer_email,
      first_name: data.customer_first_name,
      last_name: data.customer_last_name,
      metadata: {
        source: "influencer-sample",
        application_id: data.application_id,
      },
    }])

    return new StepResponse<UpsertedCustomer, { customer_id: string; created_now: boolean }>(
      { customer_id: created.id, created_now: true },
      { customer_id: created.id, created_now: true }
    )
  },
  // Compensation: only undo creation we did. We never delete a customer that
  // already existed — they may have a real account / past orders.
  async (compensationData, { container }) => {
    if (!compensationData?.created_now) return
    const customerService = container.resolve(Modules.CUSTOMER)
    await customerService.deleteCustomers(compensationData.customer_id)
  }
)
