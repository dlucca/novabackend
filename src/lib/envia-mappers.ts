// src/lib/envia-mappers.ts
import { WAREHOUSE } from "../config/warehouse"
import type { EnviaAddress, EnviaPackage, EnviaShipmentRequest } from "./envia-client"

type MedusaAddress = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  address_1?: string | null
  city?: string | null
  province?: string | null
  country_code?: string | null
  postal_code?: string | null
}

type MedusaLineItem = {
  title?: string | null
  quantity?: number | null
  unit_price?: number | null
}

export function mapAddress(medusaAddress: MedusaAddress): EnviaAddress {
  const nameParts = [medusaAddress.first_name, medusaAddress.last_name].filter(Boolean)
  return {
    name: nameParts.length > 0 ? nameParts.join(" ") : "Cliente",
    phone: medusaAddress.phone ?? "",
    street: medusaAddress.address_1 ?? "",
    city: medusaAddress.city ?? "",
    state: medusaAddress.province ?? "",
    country: (medusaAddress.country_code ?? "MX").toUpperCase(),
    postalCode: medusaAddress.postal_code ?? "",
  }
}

// Physical spec for a Novapatch vitamin-patch shipment (single pouch).
// Update these if packaging changes — they affect carrier rate quotes and label generation.
const PATCH_WEIGHT_KG = 0.2
const PATCH_DIMENSIONS = { length: 20, width: 15, height: 3 }
const PATCH_CONTENT = "Vitamin patches"

export function buildPackages(items: MedusaLineItem[]): EnviaPackage[] {
  const totalQuantity = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0)
  // unit_price is in centavos in Medusa; Envia expects pesos
  const totalValue = items.reduce(
    (sum, item) => sum + ((item.unit_price ?? 0) * (item.quantity ?? 1)) / 100,
    0
  )
  return [
    {
      type: "box",
      content: PATCH_CONTENT,
      amount: totalQuantity,
      declaredValue: totalValue,
      lengthUnit: "CM",
      weightUnit: "KG",
      weight: PATCH_WEIGHT_KG,
      dimensions: PATCH_DIMENSIONS,
    },
  ]
}

export function buildShipmentRequest(
  destination: EnviaAddress,
  items: MedusaLineItem[],
  opts?: { carrier?: string; service?: string }
): EnviaShipmentRequest {
  return {
    origin: WAREHOUSE,
    destination,
    packages: buildPackages(items),
    shipment: {
      type: 1,
      ...(opts?.carrier !== undefined ? { carrier: opts.carrier } : {}),
      ...(opts?.service !== undefined ? { service: opts.service } : {}),
    },
  }
}
