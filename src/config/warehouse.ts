import type { EnviaAddress } from "../lib/envia-client"

export const WAREHOUSE: EnviaAddress = {
  name: "Novapatch Bodega",
  phone: process.env.WAREHOUSE_PHONE ?? "+525500000000",
  street: process.env.WAREHOUSE_STREET ?? "Calle Ejemplo 123",
  city: process.env.WAREHOUSE_CITY ?? "Ciudad de México",
  state: process.env.WAREHOUSE_STATE ?? "CMX",
  country: "MX",
  postalCode: process.env.WAREHOUSE_POSTAL_CODE ?? "06600",
}
