import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as React from "react"
import { renderEmail } from "../../../../lib/resend"
import OrderConfirmation from "../../../../emails/OrderConfirmation"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const html = await renderEmail(
      React.createElement(OrderConfirmation, {
        name: "Cristian",
        displayId: "120",
        currencyCode: "mxn",
        estimatedDelivery: "3 a 5 días hábiles",
        items: [
          { title: "Novapatch Sleep", quantity: 1, unit_price: 750, metadata: {} },
        ],
        shippingAddress: {
          first_name: "Cristian",
          last_name: "Dlucca",
          address_1: "Laguna de Mayran 166 Int C704",
          city: "Ciudad de México",
          province: "Ciudad de México",
          postal_code: "11320",
        },
      })
    )

    res.setHeader("Content-Type", "text/html; charset=utf-8")
    return res.status(200).send(html)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error rendering backend template"
    return res.status(500).json({ error: message })
  }
}
