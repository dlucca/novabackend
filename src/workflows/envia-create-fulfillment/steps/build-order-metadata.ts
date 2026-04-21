// src/workflows/envia-create-fulfillment/steps/build-order-metadata.ts
import type { EnviaGenerateResult } from "../../../lib/envia-client"

export function buildOrderMetadataUpdate(
  existing: Record<string, unknown> | null | undefined,
  shipment: EnviaGenerateResult,
  deliveryEstimate: string,
  quotedCarrierCost: string
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    envia_carrier: shipment.carrier,
    envia_service: shipment.service,
    envia_eta: deliveryEstimate,
    envia_carrier_cost: quotedCarrierCost,
    envia_currency: shipment.currency,
    envia_shipment_id: String(shipment.shipmentId),
    envia_track_url: shipment.trackUrl,
    envia_label_url: shipment.label,
  }
}
