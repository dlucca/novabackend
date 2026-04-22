import type { EnviaAddress } from "../lib/envia-client"

export const WAREHOUSE: EnviaAddress = {
  name: "Novapatch Bodega",
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
}
