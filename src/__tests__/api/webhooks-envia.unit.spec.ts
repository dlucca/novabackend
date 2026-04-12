// src/__tests__/api/webhooks-envia.unit.spec.ts

function validateSecret(
  querySecret: string | undefined,
  envSecret: string | undefined
): "ok" | "missing_env" | "invalid" {
  if (!envSecret) return "missing_env"
  if (!querySecret || querySecret !== envSecret) return "invalid"
  return "ok"
}

describe("Envia webhook secret validation", () => {
  it("rejects when ENVIA_WEBHOOK_SECRET env var is not set", () => {
    expect(validateSecret("any-secret", undefined)).toBe("missing_env")
  })

  it("rejects when query secret is missing", () => {
    expect(validateSecret(undefined, "my-secret")).toBe("invalid")
  })

  it("rejects when query secret does not match env var", () => {
    expect(validateSecret("wrong-secret", "my-secret")).toBe("invalid")
  })

  it("accepts when query secret matches env var", () => {
    expect(validateSecret("my-secret", "my-secret")).toBe("ok")
  })
})
