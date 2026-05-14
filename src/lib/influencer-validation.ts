// src/lib/influencer-validation.ts
//
// Pure validator for the public POST /store/influencers payload. Lives
// outside the route handler so it's trivially unit-testable. The route
// handler delegates to this and translates the result into an HTTP
// response.

export const MX_PHONE_REGEX = /^\d{10}$/

const REQUIRED_FIELDS = [
  "nombre", "email", "pais", "telefono",
  "rango_seguidores", "nicho", "tipo_contenido",
  "tiene_contenido_bienestar", "parches",
] as const

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function validateInfluencerPayload(
  body: Record<string, unknown>
): ValidationResult {
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) {
      return { ok: false, error: `Campo requerido: ${field}` }
    }
  }

  const telefono = String(body.telefono)
  if (!MX_PHONE_REGEX.test(telefono)) {
    return {
      ok: false,
      error: "Teléfono inválido: ingresa 10 dígitos (sin lada del país)",
    }
  }

  const instagramHandle = (body.instagram_handle as string | null | undefined)?.toString().trim() || null
  const tiktokHandle = (body.tiktok_handle as string | null | undefined)?.toString().trim() || null
  if (!instagramHandle && !tiktokHandle) {
    return {
      ok: false,
      error: "Indicá al menos un handle: Instagram o TikTok",
    }
  }

  return { ok: true }
}
