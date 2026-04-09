// src/lib/envia-client.ts

// ─── Shared Address / Package Types ───────────────────────────────────────────

export type EnviaAddress = {
  name: string
  phone: string
  street: string
  city: string
  state: string
  country: string
  postalCode: string
}

export type EnviaPackage = {
  type: "box"
  content: string
  amount: number
  declaredValue: number
  lengthUnit: "CM"
  weightUnit: "KG"
  weight: number
  dimensions: { length: number; width: number; height: number }
}

export type EnviaShipmentRequest = {
  origin: EnviaAddress
  destination: EnviaAddress
  packages: EnviaPackage[]
  shipment: { type: 1; carrier?: string; service?: string }
}

export type EnviaRateResult = {
  carrier: string
  service: string
  serviceDescription: string
  deliveryEstimate: string
  totalPrice: string
  currency: string
}

export type EnviaGenerateResult = {
  carrier: string
  service: string
  shipmentId: number
  trackingNumber: string
  trackUrl: string
  label: string
  totalPrice: number
  currency: string
}

// ─── Retry Utilities ──────────────────────────────────────────────────────────

export function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const statusCode = (err as Error & { statusCode?: number }).statusCode
  if (statusCode !== undefined && (statusCode >= 500 || statusCode === 429)) return true
  const msg = err.message.toLowerCase()
  return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("etimedout")
}

async function _withRetryImpl<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isRetryable(err) || attempt === maxAttempts) throw err
      // Exponential backoff: 1s, 2s, 4s…
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)))
    }
  }
  // Unreachable — TypeScript requires a return
  throw new Error("withRetry: exhausted attempts")
}

export function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  const p = _withRetryImpl(fn, maxAttempts)
  // Suppress unhandledRejection: attach a no-op catch so Node does not fire
  // the event before the caller has a chance to attach its own handler.
  // The original promise is returned so callers can still await/catch it.
  p.catch(() => {})
  return p
}

// ─── HTTP Client ─────────────────────────────────────────────────────────────

export class EnviaClient {
  private readonly apiUrl: string
  private readonly token: string

  constructor() {
    const token = process.env.ENVIA_API_TOKEN
    const apiUrl = process.env.ENVIA_API_URL
    if (!token) throw new Error("ENVIA_API_TOKEN env var is not set")
    if (!apiUrl) throw new Error("ENVIA_API_URL env var is not set")
    this.token = token
    this.apiUrl = apiUrl
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      const err = new Error(`Envia ${path} ${response.status}: ${text}`) as Error & { statusCode: number }
      err.statusCode = response.status
      throw err
    }
    const json = (await response.json()) as { data: T }
    return json.data
  }

  /**
   * Returns a rate for a single carrier.
   * The Envia API requires one carrier per request — call this once per carrier
   * and compare results to find the cheapest.
   */
  async getRate(req: EnviaShipmentRequest): Promise<EnviaRateResult | null> {
    const results = await withRetry(() => this.post<EnviaRateResult[]>("/ship/rate/", req))
    return results?.[0] ?? null
  }

  /** Generates a shipping label using the specified carrier + service. */
  async generateShipment(req: EnviaShipmentRequest): Promise<EnviaGenerateResult> {
    return withRetry(async () => {
      const results = await this.post<EnviaGenerateResult[]>("/ship/generate/", req)
      const result = results[0]
      if (!result) throw new Error("Envia /ship/generate/ returned empty result set")
      return result
    })
  }
}
