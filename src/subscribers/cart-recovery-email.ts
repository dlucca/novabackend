import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import * as React from "react"
import { sendEmail, renderEmail } from "../lib/resend"
import CartRecovery from "../emails/CartRecovery"

type CartRecoveryEventData = {
  cart_id: string
  customer_email: string
}

export default async function cartRecoveryEmailHandler({
  event,
  container,
}: SubscriberArgs<CartRecoveryEventData>) {
  const { cart_id, customer_email } = event.data
  const logger = container.resolve("logger")
  const cartService = container.resolve(Modules.CART) as any

  // Build recovery URL pointing at the storefront's cart-recovery handler.
  // The handler reads the id, restores the cart in localStorage, and sends
  // the user to /mx/checkout to finish the purchase.
  const storefrontUrl = process.env.STOREFRONT_URL ?? "https://novapatch.care"
  const recoveryUrl = `${storefrontUrl}/cart-recovery?id=${encodeURIComponent(cart_id)}`

  try {
    const html = await renderEmail(
      React.createElement(CartRecovery, { recoveryUrl })
    )

    await sendEmail({
      to: customer_email,
      subject: "Tus parches Novapatch te están esperando",
      html,
    })

    // Mark the cart so we never email this user twice for the same cart.
    // We also tag the timestamp for traceability.
    try {
      const cart = await cartService.retrieveCart(cart_id, {
        select: ["id", "metadata"],
      })
      const existingMetadata =
        (cart?.metadata as Record<string, unknown> | null) ?? {}
      await cartService.updateCarts(cart_id, {
        metadata: {
          ...existingMetadata,
          recovery_email_sent: true,
          recovery_email_sent_at: new Date().toISOString(),
        },
      })
    } catch (metaErr) {
      // If we can't write metadata, the email already went out — that's the
      // worse failure mode (a duplicate) so log loudly but don't throw.
      logger.error(
        `[cart-recovery-email] Failed to mark cart ${cart_id} as emailed: ${
          metaErr instanceof Error ? metaErr.message : String(metaErr)
        }`
      )
    }

    logger.info(
      `[cart-recovery-email] Sent recovery email for cart ${cart_id} to ${customer_email}`
    )
  } catch (err) {
    logger.error(
      `[cart-recovery-email] Failed to send recovery email for cart ${cart_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "cart.recovery_email_due",
  context: {
    subscriberId: "cart-recovery-email",
  },
}
