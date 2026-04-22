// src/lib/envia-mappers.ts
import { WAREHOUSE } from "../config/warehouse"
import type { EnviaAddress, EnviaPackage, EnviaShipmentRequest } from "./envia-client"

type MedusaAddress = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  country_code?: string | null
  postal_code?: string | null
}

/**
 * Splits a full street string into { street, number }.
 * Envia requires them separately.
 *
 * In Mexico, address_1 typically contains "Street Name 123" and address_2 is the colonia
 * (neighborhood), NOT the street number. So we always extract the number from address_1.
 *
 * Strategy:
 * 1. If address_2 starts with a digit (e.g. "263 Int 4"), use it as `number`.
 * 2. Otherwise, extract the trailing number from address_1.
 *    e.g. "Insurgentes Sur 2000" → street="Insurgentes Sur", number="2000"
 *    e.g. "Camino Real a San Lorenzo 263" → street="Camino Real a San Lorenzo", number="263"
 * 3. Fall back to "S/N" (sin número) if none found.
 */
function splitStreetNumber(
  address1: string | null | undefined,
  address2: string | null | undefined
): { street: string; number: string } {
  const raw = address1 ?? ""

  // Only use address_2 as number if it starts with a digit (not a neighborhood name)
  if (address2 && /^\d/.test(address2.trim())) {
    return { street: raw.trim(), number: address2.trim() }
  }

  // Extract trailing number from address_1
  // e.g. "Insurgentes Sur 2000" → ["Insurgentes Sur", "2000"]
  // e.g. "Laguna de Mayran 166" → ["Laguna de Mayran", "166"]
  const match = raw.match(/^(.*?)\s+(\d[\w/-]*)$/)
  if (match) {
    return { street: match[1].trim(), number: match[2].trim() }
  }

  return { street: raw.trim(), number: "S/N" }
}

type MedusaLineItem = {
  title?: string | null
  quantity?: number | null
  unit_price?: number | null
}

// ISO 3166-2:MX — maps full state names to 2-3 letter codes that Envia accepts.
// Addresses stored in Medusa may contain either the code or the full name.
// State codes validated against Envia's /ship/generate/ endpoint.
// Note: these differ from ISO 3166-2:MX in some cases (e.g. CDMX = "DIF", not "CMX").
const MX_STATE_CODES: Record<string, string> = {
  "aguascalientes": "AGS",
  "baja california": "BC",
  "baja california norte": "BC",
  "baja california sur": "BCS",
  "campeche": "CAM",
  "chiapas": "CHP",
  "chihuahua": "CHI",
  "ciudad de mexico": "DIF",
  "cdmx": "DIF",
  "distrito federal": "DIF",
  "df": "DIF",
  "cmx": "DIF",
  "coahuila": "COA",
  "colima": "COL",
  "durango": "DGO",
  "guanajuato": "GTO",
  "guerrero": "GRO",
  "hidalgo": "HGO",
  "jalisco": "JAL",
  "jal": "JAL",
  "mexico": "MEX",
  "estado de mexico": "MEX",
  "edomex": "MEX",
  "michoacan": "MIC",
  "morelos": "MOR",
  "nayarit": "NAY",
  "nuevo leon": "NLE",
  "oaxaca": "OAX",
  "puebla": "PUE",
  "queretaro": "QRO",
  "quintana roo": "ROO",
  "san luis potosi": "SLP",
  "sinaloa": "SIN",
  "sonora": "SON",
  "tabasco": "TAB",
  "tamaulipas": "TAM",
  "tlaxcala": "TLX",
  "veracruz": "VER",
  "yucatan": "YUC",
  "zacatecas": "ZAC",
}

function normalizeState(province: string): string {
  const key = province
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .trim()
  return MX_STATE_CODES[key] ?? province
}

// Extracts the colonia from address_2. The checkout stores either:
//   - "<colonia> | <indicaciones>"  (with delivery instructions)
//   - "<colonia>"                   (no instructions)
//   - "<depto/piso>"                (AR market — not a colonia)
//   - "<number...>"                 (rare, already used as street number upstream)
// We return the portion before the "|" separator; if it's numeric we treat it
// as a number and return an empty string for the district.
function extractDistrict(address2: string | null | undefined): string {
  const raw = (address2 ?? "").trim()
  if (!raw) return ""
  if (/^\d/.test(raw)) return "" // numeric → street number, not a colonia
  return raw.split("|")[0].trim()
}

export function mapAddress(medusaAddress: MedusaAddress): EnviaAddress {
  const nameParts = [medusaAddress.first_name, medusaAddress.last_name].filter(Boolean)
  const province = medusaAddress.province ?? ""
  const { street, number } = splitStreetNumber(medusaAddress.address_1, medusaAddress.address_2)
  const district = extractDistrict(medusaAddress.address_2)
  return {
    name: nameParts.length > 0 ? nameParts.join(" ") : "Cliente",
    phone: medusaAddress.phone ?? "",
    street,
    number,
    ...(district ? { district } : {}),
    city: medusaAddress.city ?? "",
    state: province ? normalizeState(province) : "",
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
    settings: { currency: "MXN", printFormat: "PDF", printSize: "PAPER_LETTER" },
  }
}
