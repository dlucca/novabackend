// novabackend/src/api/admin/subscriptions/[id]/trigger-billing/route.ts
// Protected automatically by Medusa's admin session middleware (applied to all /admin/* routes).
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import processBillingCycleWorkflow from "../../../../../workflows/process-billing-cycle"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (process.env.ENABLE_TEST_ROUTES !== "true") {
    return res.status(403).json({ message: "Test routes not enabled" })
  }

  const { id } = req.params

  const { result } = await processBillingCycleWorkflow(req.scope).run({
    input: { subscription_id: id },
  })

  return res.json({ result })
}
