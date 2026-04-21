// src/workflows/envia-create-fulfillment/steps/select-winning-rate.ts
//
// Pure helper that builds the output object returned by generateEnviaLabelStep.
// Extracted as a standalone function so it can be unit-tested without a Medusa container.

import { type EnviaGenerateResult, type EnviaRateResult } from "../../../lib/envia-client"

export type LabelOutput = {
  shipment: EnviaGenerateResult
  deliveryEstimate: string
  quotedCarrierCost: string
}

export function buildLabelOutput(
  shipment: EnviaGenerateResult,
  winningRate: EnviaRateResult | null
): LabelOutput {
  return {
    shipment,
    deliveryEstimate: winningRate?.deliveryEstimate ?? "",
    quotedCarrierCost: winningRate?.totalPrice ?? String(shipment.totalPrice),
  }
}
