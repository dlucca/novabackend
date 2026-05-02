// src/scripts/test-billing-single-sub.ts
//
// Manually run the billing workflow against ONE subscription, bypassing
// the daily cron and the BILLING_CRON_PAUSED kill switch.
//
// Usage (positional args — Medusa exec rejects --flags):
//   railway run npx medusa exec ./src/scripts/test-billing-single-sub.ts <sub_id> [dry-run]
//
// Pass the literal string "dry-run" as the second arg to do a dry run:
// resolves provider, customer, card — does NOT charge, does NOT create
// order, does NOT advance next_billing_date.
//
// Omit the second arg (or pass "live") to execute processBillingCycleWorkflow.
// This WILL charge the sandbox card, create a Medusa order, advance
// next_billing_date by interval_days, and emit subscription.renewed.

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { resolvePaymentProviderStepFn } from "../workflows/process-billing-cycle/steps/resolve-payment-provider"
import { getChargeClient } from "../lib/payment-provider-router"
import processBillingCycleWorkflow from "../workflows/process-billing-cycle"
import { OpenpayClient } from "../modules/openpay-payment/openpay-client"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

function parseArgs(args: string[]) {
  const subId = args[0]
  const dryRun = (args[1] ?? "").toLowerCase() === "dry-run"
  return { subId, dryRun }
}

export default async function testBillingSingleSub({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { subId, dryRun } = parseArgs(args ?? [])

  if (!subId) {
    logger.error(
      "[test-billing] Missing sub_id. Usage: medusa exec ./src/scripts/test-billing-single-sub.ts <sub_id> [dry-run]"
    )
    return
  }

  const mode = dryRun ? "DRY RUN" : "LIVE CHARGE"
  logger.info(`[test-billing] Running in ${mode} mode for sub ${subId}`)

  // ─── 1. Resolve subscription + order + customer ──────────────────────────
  const subscriptionService = container.resolve(SUBSCRIPTION_MODULE)
  const orderService = container.resolve(Modules.ORDER)
  const customerService = container.resolve(Modules.CUSTOMER)

  const subscription = await subscriptionService.retrieveSubscription(subId)
  logger.info(
    `[test-billing] Sub status=${subscription.status} interval=${subscription.interval_days}d ` +
    `next_billing=${subscription.next_billing_date}`
  )

  if (!subscription.original_order_id) {
    logger.error("[test-billing] Sub has no original_order_id — cannot test")
    return
  }

  const order = await orderService.retrieveOrder(subscription.original_order_id)
  logger.info(`[test-billing] Original order id=${order.id} customer=${order.customer_id}`)

  if (!order.customer_id) {
    logger.error("[test-billing] Order has no customer_id")
    return
  }

  const customer = await customerService.retrieveCustomer(order.customer_id)
  logger.info(`[test-billing] Customer email=${customer.email}`)

  // ─── 2. Resolve payment provider ─────────────────────────────────────────
  const { provider_id } = await resolvePaymentProviderStepFn(
    { subscription_id: subId },
    { container }
  )
  logger.info(`[test-billing] Resolved provider_id=${provider_id}`)

  // ─── 3. Construct charge client (verifies router routes correctly) ───────
  let chargeClient
  try {
    chargeClient = getChargeClient(provider_id, container)
    logger.info(`[test-billing] Charge client constructed OK for ${provider_id}`)
  } catch (err) {
    logger.error(
      `[test-billing] Charge client construction FAILED: ${err instanceof Error ? err.message : String(err)}`
    )
    return
  }

  // ─── 4. Resolve vault metadata (customer id + card id) ───────────────────
  const isMP = provider_id.startsWith("pp_mercadopago")
  const vaultCustomerIdKey = isMP ? "mp_customer_id" : "openpay_customer_id"
  const defaultCardIdKey = isMP ? "mp_default_card_id" : "openpay_default_card_id"

  const vaultCustomerId = customer.metadata?.[vaultCustomerIdKey] as string | undefined
  let cardId = customer.metadata?.[defaultCardIdKey] as string | undefined

  logger.info(
    `[test-billing] Vault: customer=${vaultCustomerId ?? "<missing>"} ` +
    `default_card=${cardId ?? "<not set, will fall back to listCards>"}`
  )

  if (!vaultCustomerId) {
    logger.error(`[test-billing] Customer has no ${vaultCustomerIdKey} — cron would mark past_due`)
    return
  }

  // ─── 5. Verify card lookup works (mirrors the cron's fallback path) ──────
  if (!cardId && !isMP) {
    try {
      const merchantId = process.env.OPENPAY_MERCHANT_ID ?? ""
      const privateKey = process.env.OPENPAY_PRIVATE_KEY ?? ""
      const sandbox = process.env.OPENPAY_SANDBOX !== "false"
      const opClient = new OpenpayClient({ merchantId, privateKey, sandbox })
      const cards = await opClient.listCards(vaultCustomerId)
      cardId = cards[0]?.id
      logger.info(
        `[test-billing] Openpay listCards returned ${cards.length} card(s); chose ${cardId ?? "<none>"}`
      )
    } catch (err) {
      logger.error(
        `[test-billing] Openpay listCards FAILED: ${err instanceof Error ? err.message : String(err)}`
      )
      return
    }
  }

  if (!cardId) {
    logger.error("[test-billing] No card available — cron would mark past_due")
    return
  }

  // ─── 6. Stop here in dry-run mode ────────────────────────────────────────
  if (dryRun) {
    logger.info("[test-billing] ✓ Dry-run complete. All paths resolve cleanly:")
    logger.info(`[test-billing]   provider:  ${provider_id}`)
    logger.info(`[test-billing]   vault_id:  ${vaultCustomerId}`)
    logger.info(`[test-billing]   card_id:   ${cardId}`)
    logger.info("[test-billing] Run again without 'dry-run' arg to actually charge.")
    return
  }

  // ─── 7. LIVE: run the full workflow ──────────────────────────────────────
  logger.warn("[test-billing] LIVE RUN — invoking processBillingCycleWorkflow")
  try {
    const { result } = await processBillingCycleWorkflow(container).run({
      input: { subscription_id: subId },
    })
    logger.info(`[test-billing] Workflow result: ${JSON.stringify(result)}`)

    // Refetch sub to verify next_billing_date advanced
    const after = await subscriptionService.retrieveSubscription(subId, {
      relations: ["subscription_orders"],
    })
    logger.info(
      `[test-billing] Sub after billing: status=${after.status} ` +
      `next_billing=${after.next_billing_date} cycles=${(after as any).subscription_orders?.length ?? 0}`
    )
  } catch (err) {
    logger.error(
      `[test-billing] Workflow FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`
    )
  }
}
