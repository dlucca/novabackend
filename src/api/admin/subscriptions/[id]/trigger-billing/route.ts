// novabackend/src/api/admin/subscriptions/[id]/trigger-billing/route.ts
//
// Auth: Medusa V2's ApiLoader automatically applies the built-in `authenticate("admin", ...)`
// middleware to every route whose file path matches /admin/ — unless the route explicitly
// exports `AUTHENTICATE = false`. Because this file does not export that flag,
// `shouldAuthenticate` defaults to `true` in routes-loader.js (node_modules/@medusajs/
// framework/dist/http/routes-loader.js, line 197-199) and the framework's
// `_ApiLoader_applyAuthMiddleware` (router.js, line 262-280) enforces a valid admin
// session token on every request. No additional middleware in src/api/middlewares.ts is needed.
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import processBillingCycleWorkflow from "../../../../../workflows/process-billing-cycle"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (process.env.ENABLE_TEST_ROUTES !== "true") {
    return res.status(403).json({ message: "Test routes not enabled" })
  }

  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: "subscription id is required" })
  }

  try {
    const { result } = await processBillingCycleWorkflow(req.scope).run({
      input: { subscription_id: id },
    })
    return res.json({ result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Billing workflow failed"
    return res.status(500).json({ message })
  }
}
