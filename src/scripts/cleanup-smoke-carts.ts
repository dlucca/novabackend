// src/scripts/cleanup-smoke-carts.ts
//
// One-time retroactive cleanup. The pre-checkout smoke creates a real
// cart with line items + a fake email (smoke-test@novapatch.care) every
// run. The cart-recovery job didn't filter those out until we added the
// metadata.smoke_test=true guard — but old smoke carts in the DB don't
// have that flag yet, so they could still trigger a recovery email and
// produce a Resend bounce before the new filter helps.
//
// This script finds all carts with that fake email and sets
// metadata.smoke_test = true on each, making the new filter retroactive.
//
// Idempotent — safe to re-run. If a cart already has the flag, the
// update is a no-op.
//
// Run:
//   railway ssh --service novabackend
//   npx medusa exec ./src/scripts/cleanup-smoke-carts.ts

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const SMOKE_EMAIL = "smoke-test@novapatch.care"

export default async function cleanupSmokeCarts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const cartService = container.resolve(Modules.CART)

  logger.info(`[cleanup-smoke-carts] Searching for carts with email=${SMOKE_EMAIL}...`)

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "email", "metadata", "completed_at"],
    filters: { email: SMOKE_EMAIL } as any,
  })

  logger.info(`[cleanup-smoke-carts] Found ${carts.length} cart(s) matching`)

  let updated = 0
  let alreadyFlagged = 0

  for (const cart of carts) {
    if ((cart.metadata as any)?.smoke_test === true) {
      alreadyFlagged++
      continue
    }
    await cartService.updateCarts(cart.id, {
      metadata: {
        ...((cart.metadata as Record<string, unknown> | null) ?? {}),
        smoke_test: true,
      },
    })
    updated++
  }

  logger.info(
    `[cleanup-smoke-carts] Done. Updated ${updated} cart(s), ${alreadyFlagged} already flagged.`
  )
}
