import { validateInfluencerPayload } from "../../lib/influencer-validation"

const VALID_BODY = {
  nombre: "Ana López",
  email: "ana@example.com",
  pais: "mx",
  telefono: "5512345678",
  rango_seguidores: "10k–50k",
  nicho: ["Wellness"],
  tipo_contenido: ["Reels"],
  tiene_contenido_bienestar: "no",
  parches: ["energy"],
  instagram_handle: "ana",
  tiktok_handle: null,
}

describe("validateInfluencerPayload", () => {
  it("accepts a complete, valid payload", () => {
    expect(validateInfluencerPayload(VALID_BODY)).toEqual({ ok: true })
  })

  it("rejects when telefono is missing", () => {
    const { telefono: _t, ...body } = VALID_BODY
    expect(validateInfluencerPayload(body)).toEqual({
      ok: false,
      error: "Campo requerido: telefono",
    })
  })

  it("rejects when telefono is not 10 digits", () => {
    expect(validateInfluencerPayload({ ...VALID_BODY, telefono: "12345" })).toEqual({
      ok: false,
      error: "Teléfono inválido: ingresa 10 dígitos (sin lada del país)",
    })
  })

  it("rejects when telefono contains non-digits", () => {
    expect(validateInfluencerPayload({ ...VALID_BODY, telefono: "55-1234-5678" })).toEqual({
      ok: false,
      error: "Teléfono inválido: ingresa 10 dígitos (sin lada del país)",
    })
  })

  it("rejects when neither handle is provided", () => {
    expect(
      validateInfluencerPayload({ ...VALID_BODY, instagram_handle: null, tiktok_handle: null })
    ).toEqual({
      ok: false,
      error: "Indicá al menos un handle: Instagram o TikTok",
    })
  })

  it("rejects when a non-handle required field is missing", () => {
    const { nombre: _n, ...body } = VALID_BODY
    expect(validateInfluencerPayload(body)).toEqual({
      ok: false,
      error: "Campo requerido: nombre",
    })
  })
})
