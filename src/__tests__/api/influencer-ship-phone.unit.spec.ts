// src/__tests__/api/influencer-ship-phone.unit.spec.ts
import {
  guardShippableApplication,
  buildShipDestination,
} from "../../api/admin/influencers/[id]/ship/lib"

const APP_BASE = {
  id: "app_1",
  nombre: "Ana López",
  telefono: "5512345678",
  parches: ["energy"],
  estado: "aprobado",
  tracking_number: null,
  direccion: {
    street: "Insurgentes Sur 1234",
    interior: "5",
    colonia: "Del Valle",
    city: "Benito Juárez",
    state: "CDMX",
    zip: "03100",
  },
} as const

describe("guardShippableApplication", () => {
  it("returns ok for a valid approved application with telefono", () => {
    expect(guardShippableApplication(APP_BASE)).toEqual({ ok: true })
  })

  it("rejects when estado is not aprobado", () => {
    const result = guardShippableApplication({ ...APP_BASE, estado: "pendiente" })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("Solo se pueden enviar muestras a postulaciones aprobadas"),
    })
  })

  it("rejects when a tracking_number already exists", () => {
    const result = guardShippableApplication({ ...APP_BASE, tracking_number: "TRK1" })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("ya tiene una etiqueta"),
    })
  })

  it("rejects when parches is empty", () => {
    const result = guardShippableApplication({ ...APP_BASE, parches: [] })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene parches"),
    })
  })

  it("rejects when direccion is missing", () => {
    const result = guardShippableApplication({ ...APP_BASE, direccion: null })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene dirección"),
    })
  })

  it("rejects when telefono is missing", () => {
    const result = guardShippableApplication({ ...APP_BASE, telefono: null })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene teléfono"),
    })
  })

  it("rejects when telefono is empty string", () => {
    const result = guardShippableApplication({ ...APP_BASE, telefono: "" })
    expect(result).toEqual({
      ok: false,
      status: 422,
      error: expect.stringContaining("no tiene teléfono"),
    })
  })
})

describe("buildShipDestination", () => {
  it("forwards application.telefono as the destination phone", () => {
    const dest = buildShipDestination(APP_BASE)
    expect(dest.phone).toBe("5512345678")
  })

  it("includes the influencer's full name", () => {
    const dest = buildShipDestination(APP_BASE)
    expect(dest.name).toBe("Ana López")
  })

  it("strips common interior prefixes (Int, Depto)", () => {
    const dest = buildShipDestination({
      ...APP_BASE,
      direccion: { ...APP_BASE.direccion, interior: "Depto 5" },
    })
    // street should end with "Int 5", not "Int Depto 5"
    expect(dest.street.endsWith("Int 5")).toBe(true)
  })

  it("forwards direccion.instructions as the reference field", () => {
    const dest = buildShipDestination({
      ...APP_BASE,
      direccion: { ...APP_BASE.direccion, instructions: "Tocar el portero del depto 5" },
    })
    expect(dest.reference).toBe("Tocar el portero del depto 5")
  })

  it("omits reference when instructions is empty or whitespace", () => {
    const dest = buildShipDestination({
      ...APP_BASE,
      direccion: { ...APP_BASE.direccion, instructions: "   " },
    })
    expect(dest.reference).toBeUndefined()
  })
})
