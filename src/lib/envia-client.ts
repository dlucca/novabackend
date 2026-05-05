// src/lib/envia-client.ts

// ─── Shared Address / Package Types ───────────────────────────────────────────

export type EnviaAddress = {
  // In Envia's schema `name` is the *person's name* (the contact who attends
  // pickup or receives the package). The business / razón social goes in
  // `company`. We had `name` set to "Novapatch Bodega" originally, which
  // tripped Envia's pickup flow because it expected a human name.
  name: string
  company?: string
  email?: string
  phone: string
  street: string
  number: string
  district?: string  // colonia / barrio / neighborhood — required by MX carriers
  city: string
  state: string
  country: string
  postalCode: string
  reference?: string  // free-form note: building color, "frente al parque", etc.
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
  settings?: { currency?: string; comments?: string; printFormat?: string; printSize?: string }
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
    const json = (await response.json()) as {
      meta?: string
      data: T
      error?: { message?: string; description?: string } | string | null
    }
    // Envia returns HTTP 200 but meta:"error" for application-level errors
    if (json.meta === "error") {
      let msg = "Unknown Envia error"
      if (typeof json.error === "string") {
        msg = json.error
      } else if (json.error && typeof json.error === "object") {
        msg = json.error.message ?? json.error.description ?? msg
      }
      const err = new Error(`Envia ${path} error: ${msg}`) as Error & { statusCode: number }
      err.statusCode = 422
      throw err
    }
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

  /**
   * Cancels a previously generated shipment.
   * Used as a compensation step: if Medusa fulfillment creation fails after a label
   * has already been generated, this voids the label in Envia to avoid a phantom charge.
   */
  async cancelShipment({
    shipmentId,
    carrier,
    trackingNumber,
  }: {
    shipmentId: number
    carrier: string
    trackingNumber: string
  }): Promise<void> {
    // Cancellation is best-effort — don't retry on 4xx (already cancelled / invalid)
    await this.post<unknown>("/ship/cancel", { shipmentId, carrier, trackingNumber })
  }
}
