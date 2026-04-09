// src/scripts/test-envia-subscriber.ts
// Runs the Envia fulfillment workflow directly against a real order.
// Usage: ORDER_ID=ord_XXX npx medusa exec ./src/scripts/test-envia-subscriber.ts

import { enviaCreateFulfillmentWorkflow } from "../workflows/envia-create-fulfillment"

export default async function testEnviaSubscriber({ container }: { container: any }) {
  const orderId = process.env.ORDER_ID
  if (!orderId) throw new Error("ORDER_ID env var is required (e.g. ORDER_ID=ord_XXX ...)")

  console.log(`\nTesting Envia fulfillment workflow for order: ${orderId}\n`)

  await enviaCreateFulfillmentWorkflow(container).run({ input: { orderId } })

  console.log("\nScript finished — check logs above for result.")
}
