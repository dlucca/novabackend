// src/workflows/envia-create-fulfillment/__tests__/create-fulfillment.unit.spec.ts

import { buildOrderMetadataUpdate } from "../steps/build-order-metadata"
import type { EnviaGenerateResult } from "../../../lib/envia-client"

const baseShipment: EnviaGenerateResult = {
  carrier: "fedex",
  service: "ground",
  shipmentId: 99001,
  trackingNumber: "TRACK-XYZ",
  trackUrl: "https://track.fedex.com/TRACK-XYZ",
  label: "https://labels.envia.com/label-99001.pdf",
  totalPrice: 200,
  currency: "MXN",
}

describe("buildOrderMetadataUpdate", () => {
  it("writes all expected envia_* keys", () => {
    const result = buildOrderMetadataUpdate(null, baseShipment, "2026-04-25", "195.00")
    expect(result.envia_carrier).toBe("fedex")
    expect(result.envia_service).toBe("ground")
    expect(result.envia_eta).toBe("2026-04-25")
    expect(result.envia_carrier_cost).toBe("195.00")
    expect(result.envia_currency).toBe("MXN")
    expect(result.envia_shipment_id).toBe("99001")
    expect(result.envia_track_url).toBe("https://track.fedex.com/TRACK-XYZ")
    expect(result.envia_label_url).toBe("https://labels.envia.com/label-99001.pdf")
  })

  it("preserves existing metadata keys", () => {
    const existing = { my_key: "my_value", other: 42 }
    const result = buildOrderMetadataUpdate(existing, baseShipment, "2026-04-25", "195.00")
    expect(result.my_key).toBe("my_value")
    expect(result.other).toBe(42)
    expect(result.envia_carrier).toBe("fedex")
  })

  it("handles null existing metadata", () => {
    const result = buildOrderMetadataUpdate(null, baseShipment, "2026-04-25", "195.00")
    expect(result.envia_eta).toBe("2026-04-25")
    expect((result as any).undefined).toBeUndefined()
  })

  it("handles undefined existing metadata", () => {
    const result = buildOrderMetadataUpdate(undefined, baseShipment, "2026-04-25", "195.00")
    expect(result.envia_eta).toBe("2026-04-25")
  })

  it("writes empty string deliveryEstimate correctly (fallback case)", () => {
    const result = buildOrderMetadataUpdate(null, baseShipment, "", "200")
    expect(result.envia_eta).toBe("")
  })

  it("converts numeric shipmentId to string", () => {
    const result = buildOrderMetadataUpdate(null, baseShipment, "2026-04-25", "195.00")
    expect(typeof result.envia_shipment_id).toBe("string")
    expect(result.envia_shipment_id).toBe("99001")
  })

  it("overwrites existing envia_* keys with new values", () => {
    const existing = { envia_carrier: "old_carrier", envia_eta: "2025-01-01" }
    const result = buildOrderMetadataUpdate(existing, baseShipment, "2026-04-25", "195.00")
    expect(result.envia_carrier).toBe("fedex")
    expect(result.envia_eta).toBe("2026-04-25")
  })
})
