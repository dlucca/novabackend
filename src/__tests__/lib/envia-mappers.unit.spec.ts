// src/__tests__/lib/envia-mappers.unit.spec.ts
import { mapAddress, buildPackages, buildShipmentRequest } from "../../lib/envia-mappers"

// Stub the warehouse import so tests don't need env vars
jest.mock("../../config/warehouse", () => ({
  WAREHOUSE: {
    name: "Bodega Test",
    phone: "+525500000000",
    street: "Calle Test",
    number: "1",
    city: "CDMX",
    state: "CMX",
    country: "MX",
    postalCode: "06600",
  },
}))

describe("mapAddress", () => {
  it("maps a full Medusa shipping address to EnviaAddress", () => {
    const result = mapAddress({
      first_name: "Luis",
      last_name: "Pérez",
      phone: "+52 5511111111",
      address_1: "Insurgentes Sur 2000",
      city: "Ciudad de México",
      province: "CMX",
      country_code: "mx",
      postal_code: "03100",
    })
    expect(result).toEqual({
      name: "Luis Pérez",
      phone: "+52 5511111111",
      street: "Insurgentes Sur",
      number: "2000",
      city: "Ciudad de México",
      state: "DIF",
      country: "MX",
      postalCode: "03100",
    })
  })

  it("defaults name to 'Cliente' when first/last name are missing", () => {
    const result = mapAddress({ country_code: "mx" })
    expect(result.name).toBe("Cliente")
  })

  it("uppercases the country code", () => {
    const result = mapAddress({ country_code: "mx" })
    expect(result.country).toBe("MX")
  })

  it("returns empty strings for missing optional fields", () => {
    const result = mapAddress({})
    expect(result.phone).toBe("")
    expect(result.street).toBe("")
    expect(result.city).toBe("")
    expect(result.state).toBe("")
    expect(result.postalCode).toBe("")
  })
})

describe("buildPackages", () => {
  it("always returns amount=1 since we ship one envelope regardless of item count", () => {
    // amount on Envia's package = number of physical packages, NOT items
    // inside. Sending amount=3 produced 3 duplicate tracking numbers in
    // production for influencer samples — see fix in buildPackages.
    const [pkg] = buildPackages([
      { quantity: 2, unit_price: 120000 },
      { quantity: 1, unit_price: 120000 },
    ])
    expect(pkg.amount).toBe(1)
    expect(pkg.type).toBe("box")
  })

  it("calculates declared value as sum of (unit_price * quantity) / 100", () => {
    // 2 × 120000 + 1 × 60000 = 300000 centavos → 3000 MXN
    const [pkg] = buildPackages([
      { quantity: 2, unit_price: 120000 },
      { quantity: 1, unit_price: 60000 },
    ])
    expect(pkg.declaredValue).toBe(3000)
  })

  it("uses fixed dimensions and weight from spec", () => {
    const [pkg] = buildPackages([{ quantity: 1, unit_price: 100000 }])
    expect(pkg.dimensions).toEqual({ length: 20, width: 15, height: 3 })
    expect(pkg.weight).toBe(0.2)
    expect(pkg.lengthUnit).toBe("CM")
    expect(pkg.weightUnit).toBe("KG")
  })

  it("handles a single item with quantity 1", () => {
    const [pkg] = buildPackages([{ quantity: 1, unit_price: 120000 }])
    expect(pkg.amount).toBe(1)
    expect(pkg.declaredValue).toBe(1200)
  })
})

describe("buildShipmentRequest", () => {
  const destination = {
    name: "Ana García",
    phone: "+52 5511111111",
    street: "Av. Reforma",
    number: "500",
    city: "CDMX",
    state: "CMX",
    country: "MX",
    postalCode: "06600",
  }

  it("sets shipment type to 1 always", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }])
    expect(req.shipment.type).toBe(1)
  })

  it("includes carrier and service when provided", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }], {
      carrier: "dhl",
      service: "ground",
    })
    expect(req.shipment.carrier).toBe("dhl")
    expect(req.shipment.service).toBe("ground")
  })

  it("omits carrier and service when not provided", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }])
    expect(req.shipment.carrier).toBeUndefined()
    expect(req.shipment.service).toBeUndefined()
  })

  it("uses WAREHOUSE as origin", () => {
    const req = buildShipmentRequest(destination, [{ quantity: 1, unit_price: 100000 }])
    expect(req.origin.name).toBe("Bodega Test")
  })
})
