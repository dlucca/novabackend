// src/__tests__/workflows/envia-create-fulfillment/select-winning-rate.unit.spec.ts

import { buildLabelOutput } from "../../../workflows/envia-create-fulfillment/steps/select-winning-rate"
import type { EnviaGenerateResult, EnviaRateResult } from "../../../lib/envia-client"

const baseShipment: EnviaGenerateResult = {
  carrier: "dhl",
  service: "express",
  shipmentId: 12345,
  trackingNumber: "TRACK-001",
  trackUrl: "https://track.dhl.com/TRACK-001",
  label: "https://labels.envia.com/label.pdf",
  totalPrice: 150,
  currency: "MXN",
}

const baseRate: EnviaRateResult = {
  carrier: "dhl",
  service: "express",
  serviceDescription: "DHL Express",
  deliveryEstimate: "2026-04-22",
  totalPrice: "148.50",
  currency: "MXN",
}

describe("buildLabelOutput", () => {
  it("returns deliveryEstimate from winningRate when present", () => {
    const output = buildLabelOutput(baseShipment, baseRate)
    expect(output.deliveryEstimate).toBe("2026-04-22")
  })

  it("falls back to empty string for deliveryEstimate when winningRate is null", () => {
    const output = buildLabelOutput(baseShipment, null)
    expect(output.deliveryEstimate).toBe("")
  })

  it("returns quotedCarrierCost from winningRate totalPrice when present", () => {
    const output = buildLabelOutput(baseShipment, baseRate)
    expect(output.quotedCarrierCost).toBe("148.50")
  })

  it("falls back to shipment.totalPrice string when winningRate is null", () => {
    const output = buildLabelOutput(baseShipment, null)
    expect(output.quotedCarrierCost).toBe("150")
  })

  it("always includes the shipment in the output", () => {
    const output = buildLabelOutput(baseShipment, baseRate)
    expect(output.shipment).toBe(baseShipment)
  })
})
