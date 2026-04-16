import { render } from "@react-email/components"
import * as React from "react"
import OrderConfirmation from "../../emails/OrderConfirmation"
import OrderShipped from "../../emails/OrderShipped"
import OrderDelivered from "../../emails/OrderDelivered"
import OrderDeliveryFailed from "../../emails/OrderDeliveryFailed"
import SubscriptionUpcomingCharge from "../../emails/SubscriptionUpcomingCharge"

const CONFIRMATION_PROPS = {
  name: "Test",
  displayId: "99",
  currencyCode: "mxn",
  items: [{ title: "Shield", quantity: 1, unit_price: 750 }],
  shippingAddress: {
    first_name: "Test",
    last_name: "User",
    address_1: "Calle 1",
    city: "CDMX",
    province: "CDMX",
    postal_code: "06600",
  },
}

describe("Email templates render without errors", () => {
  it("OrderConfirmation renders and contains expected content", async () => {
    const html = await render(React.createElement(OrderConfirmation, CONFIRMATION_PROPS))
    expect(html).toContain("Confirmamos tu pedido")
    expect(html).toContain("#99")
    expect(html).toContain("Confirmado")
    expect(html).toContain("En camino")
    expect(html).toContain("Entregado")
    expect(html).toContain("bienestar que no interrumpe tu d")
    expect(html).toContain("novapatch.care")
    expect(html).toContain("2025 Novapatch")
    expect(html).not.toContain("Ver detalles de mi pedido")
    expect(html).not.toContain("En preparaci")
  })

  it("OrderShipped renders with step 1 active", async () => {
    const html = await render(
      React.createElement(OrderShipped, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
        trackingUrl: "https://example.com/track/ABC123",
        carrier: "99minutos",
      })
    )
    expect(html).toContain("en camino")
    expect(html).toContain("ABC123")
    expect(html).not.toContain("En preparaci")
  })

  it("OrderDelivered renders with step 2 active", async () => {
    const html = await render(
      React.createElement(OrderDelivered, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
      })
    )
    expect(html).toContain("fue entregado")
    expect(html).toContain("bienestar que no interrumpe tu d")
  })

  it("OrderDeliveryFailed renders tracker and failureReason", async () => {
    const html = await render(
      React.createElement(OrderDeliveryFailed, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
        status: "failed",
        failureReason: "Destinatario no encontrado",
      })
    )
    expect(html).toContain("No pudimos entregar")
    expect(html).toContain("No entregado")
    expect(html).toContain("Detalle del transportista:")
    expect(html).toContain("Destinatario no encontrado")
  })

  it("OrderDeliveryFailed renders without failureReason (optional prop)", async () => {
    const html = await render(
      React.createElement(OrderDeliveryFailed, {
        name: "Test",
        displayId: "99",
        trackingNumber: "ABC123",
        status: "returned",
      })
    )
    expect(html).toContain("fue devuelto")
    expect(html).not.toContain("Detalle del transportista")
  })

  it("SubscriptionUpcomingCharge renders with expected content", async () => {
    const html = await render(
      React.createElement(SubscriptionUpcomingCharge, {
        customerName: "Ana",
        productTitle: "Parche Energía Novapatch",
        nextBillingDate: new Date("2026-04-19T06:00:00.000Z").toISOString(),
        interval_days: 30,
      })
    )
    expect(html).toContain("Tu suscripción se renueva pronto")
    expect(html).toContain("Ana")
    expect(html).toContain("Parche Energía Novapatch")
    expect(html).toContain("mensual")
    expect(html).toContain("novapatch.care/cuenta/suscripciones")
    expect(html).toContain("bienestar que no interrumpe tu d")
  })
})
