export type OpenpayCard = {
  id: string
  brand: string
  card_number: string   // last 4 digits displayed as "XXXX"
  holder_name: string
  expiration_year: string
  expiration_month: string
  bank_name: string
}

export type OpenpayCustomer = {
  id: string
  name: string
  last_name: string
  email: string
}

export type OpenpayCharge = {
  id: string
  status: "completed" | "in_progress" | "failed" | "refunded" | "charge_pending"
  amount: number
  currency: string
  error_code?: string
  error_message?: string
  payment_method?: { url: string; type?: string }
}

type ClientOptions = {
  merchantId: string
  privateKey: string
  sandbox: boolean
}

export class OpenpayClient {
  private readonly baseUrl: string
  private readonly authHeader: string

  constructor(options: ClientOptions) {
    const host = options.sandbox
      ? "https://sandbox-api.openpay.mx"
      : "https://api.openpay.mx"
    this.baseUrl = `${host}/v1/${options.merchantId}`
    this.authHeader = "Basic " + Buffer.from(`${options.privateKey}:`).toString("base64")
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      let description = `Openpay error ${response.status}`
      try {
        const err = await response.json() as { description?: string }
        if (err.description) description = err.description
      } catch { /* non-JSON body — use the status fallback */ }
      throw new Error(description)
    }

    return await response.json() as T
  }

  createCustomer(params: {
    name: string
    last_name: string
    email: string
    phone_number?: string
  }): Promise<OpenpayCustomer> {
    return this.request<OpenpayCustomer>("POST", "/customers", params)
  }

  storeCard(customerId: string, params: { token_id: string; device_session_id?: string }): Promise<OpenpayCard> {
    return this.request<OpenpayCard>("POST", `/customers/${customerId}/cards`, params)
  }

  listCards(customerId: string): Promise<OpenpayCard[]> {
    return this.request<OpenpayCard[]>("GET", `/customers/${customerId}/cards`)
  }

  chargeCustomerCard(
    customerId: string,
    params: {
      source_id: string     // stored card ID
      amount: number        // in PESOS (not centavos)
      currency: string
      description: string
      device_session_id?: string
      order_id?: string
      redirect_url?: string // required for 3D Secure
      use_3d_secure?: boolean     // nuevo: activa flujo 3DS en Openpay
    }
  ): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("POST", `/customers/${customerId}/charges`, {
      ...params,
      method: "card",
    })
  }

  getCharge(chargeId: string): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("GET", `/charges/${chargeId}`)
  }

  getCustomerCharge(customerId: string, chargeId: string): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("GET", `/customers/${customerId}/charges/${chargeId}`)
  }

  refundCharge(chargeId: string, params: { description: string; amount?: number }): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("POST", `/charges/${chargeId}/refund`, params)
  }
}
