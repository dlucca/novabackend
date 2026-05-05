import type { EnviaAddress } from "../lib/envia-client"

// Envia treats `name` as the contact PERSON (used during pickups — the
// courier asks for this name when arriving at the bodega). The business /
// razón social goes in `company`. Keep these distinct.
export const WAREHOUSE: EnviaAddress = {
  name: process.env.WAREHOUSE_CONTACT_NAME ?? "Novapatch",
  company: process.env.WAREHOUSE_COMPANY ?? "Novapatch",
  ...(process.env.WAREHOUSE_EMAIL
    ? { email: process.env.WAREHOUSE_EMAIL }
    : {}),
  phone: process.env.WAREHOUSE_PHONE ?? "+525500000000",
  street: process.env.WAREHOUSE_STREET ?? "Camino Real a San Lorenzo",
  number: process.env.WAREHOUSE_NUMBER ?? "263",
  ...(process.env.WAREHOUSE_DISTRICT
    ? { district: process.env.WAREHOUSE_DISTRICT }
    : {}),
  city: process.env.WAREHOUSE_CITY ?? "Iztapalapa",
  state: process.env.WAREHOUSE_STATE ?? "DIF",
  country: "MX",
  postalCode: process.env.WAREHOUSE_POSTAL_CODE ?? "09360",
  ...(process.env.WAREHOUSE_REFERENCE
    ? { reference: process.env.WAREHOUSE_REFERENCE }
    : {}),
}
