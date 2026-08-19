import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as React from "react"
import { renderEmail } from "../../../../../lib/resend"

import OrderConfirmation from "../../../../../emails/OrderConfirmation"
import OrderShipped from "../../../../../emails/OrderShipped"
import OrderDelivered from "../../../../../emails/OrderDelivered"
import OrderDeliveryFailed from "../../../../../emails/OrderDeliveryFailed"
import SubscriptionWelcome from "../../../../../emails/SubscriptionWelcome"
import SubscriptionUpcomingCharge from "../../../../../emails/SubscriptionUpcomingCharge"
import SubscriptionRenewed from "../../../../../emails/SubscriptionRenewed"
import SubscriptionPaymentFailed from "../../../../../emails/SubscriptionPaymentFailed"
import CartRecovery from "../../../../../emails/CartRecovery"
import InfluencerSamplesShipped from "../../../../../emails/InfluencerSamplesShipped"
import AdminInvite from "../../../../../emails/AdminInvite"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const templateKey = (req.query.template as string) || "order_confirmation"

    let element: React.ReactElement

    switch (templateKey) {
      case "order_shipped":
        element = React.createElement(OrderShipped, OrderShipped.defaultProps as any)
        break

      case "order_delivered":
        element = React.createElement(OrderDelivered, OrderDelivered.defaultProps as any)
        break

      case "order_delivery_failed":
        element = React.createElement(OrderDeliveryFailed, OrderDeliveryFailed.defaultProps as any)
        break

      case "subscription_welcome":
        element = React.createElement(SubscriptionWelcome, SubscriptionWelcome.defaultProps as any)
        break

      case "subscription_upcoming_charge":
        element = React.createElement(SubscriptionUpcomingCharge, SubscriptionUpcomingCharge.defaultProps as any)
        break

      case "subscription_renewed":
        element = React.createElement(SubscriptionRenewed, SubscriptionRenewed.defaultProps as any)
        break

      case "subscription_payment_failed":
        element = React.createElement(SubscriptionPaymentFailed, SubscriptionPaymentFailed.defaultProps as any)
        break

      case "cart_recovery":
        element = React.createElement(CartRecovery, CartRecovery.defaultProps as any)
        break

      case "influencer_samples":
        element = React.createElement(InfluencerSamplesShipped, InfluencerSamplesShipped.defaultProps as any)
        break

      case "admin_invite":
        element = React.createElement(AdminInvite, AdminInvite.defaultProps as any)
        break

      case "order_confirmation":
      default:
        element = React.createElement(OrderConfirmation, OrderConfirmation.defaultProps as any)
        break
    }

    const html = await renderEmail(element)

    res.setHeader("Content-Type", "text/html; charset=utf-8")
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error rendering backend template"
    return res.status(500).json({ error: message })
  }
}
