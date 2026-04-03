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
  status: "completed" | "in_progress" | "failed" | "refunded"
  amount: number
  currency: string
  error_code?: string
  error_message?: string
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
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json()
    if (!response.ok) {
      const err = data as { description?: string }
      throw new Error(err.description ?? `Openpay error ${response.status}`)
    }
    return data as T
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

  refundCharge(chargeId: string, params: { description: string; amount?: number }): Promise<OpenpayCharge> {
    return this.request<OpenpayCharge>("POST", `/charges/${chargeId}/refund`, params)
  }
}
