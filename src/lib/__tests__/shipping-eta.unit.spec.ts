import { resolveShippingEta } from "../shipping-eta"

describe("resolveShippingEta", () => {
  it("returns the CDMX/EdoMex window for Ciudad de México", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "Ciudad de México" })).toBe("2-3 días hábiles")
  })

  it("returns the CDMX/EdoMex window for Estado de México", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "Estado de México" })).toBe("2-3 días hábiles")
  })

  it("returns the national window for Jalisco", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "Jalisco" })).toBe("3-5 días hábiles")
  })

  it("returns the national window when the province is missing", () => {
    expect(resolveShippingEta({ country_code: "mx", province: "" })).toBe("3-5 días hábiles")
  })

  it("returns an empty string for non-MX addresses", () => {
    expect(resolveShippingEta({ country_code: "ar", province: "Buenos Aires" })).toBe("")
  })

  it("is case- and accent-insensitive on province name", () => {
    expect(resolveShippingEta({ country_code: "MX", province: "CIUDAD DE MEXICO" })).toBe("2-3 días hábiles")
    expect(resolveShippingEta({ country_code: "mx", province: "estado de mexico" })).toBe("2-3 días hábiles")
  })

  it("handles null province and country_code", () => {
    expect(resolveShippingEta({ country_code: null, province: null })).toBe("")
    expect(resolveShippingEta({ country_code: "mx", province: null })).toBe("3-5 días hábiles")
  })
})
