// src/modules/mercadopago-payment/mercadopago-client.ts

export type MPCustomer = {
  id: string
  email: string
  first_name: string
  last_name: string
}

export type MPCard = {
  id: string
  first_six_digits: string
  last_four_digits: string
  expiration_month: number
  expiration_year: number
  payment_method: { id: string; name: string }
  cardholder: { name: string }
}

export type MPPayment = {
  id: number
  status: "approved" | "pending" | "rejected" | "cancelled" | "refunded" | "charged_back" | "in_process" | "authorized"
  status_detail: string
  transaction_amount: number
  currency_id: string
}

type ClientOptions = {
  accessToken: string
  sandbox: boolean
}

export class MercadoPagoClient {
  private readonly baseUrl = "https://api.mercadopago.com"
  private readonly authHeader: string

  constructor(options: ClientOptions) {
    this.authHeader = `Bearer ${options.accessToken}`
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

    if (!response.ok) {
      let message = `MercadoPago error ${response.status}`
      try {
        const err = await response.json() as { message?: string; error?: string }
        if (err.message) message = err.message
        else if (err.error) message = err.error
      } catch { /* non-JSON body — use the status fallback */ }
      throw new Error(message)
    }

    return await response.json() as T
  }

  async searchCustomerByEmail(email: string): Promise<MPCustomer | null> {
    const encoded = encodeURIComponent(email)
    const result = await this.request<{ results: MPCustomer[] }>(
      "GET",
      `/v1/customers/search?email=${encoded}`
    )
    return result.results[0] ?? null
  }

  async createCustomer(params: { email: string; first_name: string; last_name: string }): Promise<MPCustomer> {
    return this.request<MPCustomer>("POST", "/v1/customers", params)
  }

  async getOrCreateCustomer(params: { email: string; first_name: string; last_name: string }): Promise<MPCustomer> {
    const existing = await this.searchCustomerByEmail(params.email)
    if (existing) return existing
    return this.createCustomer(params)
  }

  async createCard(customerId: string, cardToken: string): Promise<MPCard> {
    return this.request<MPCard>("POST", `/v1/customers/${customerId}/cards`, { token: cardToken })
  }

  async listCards(customerId: string): Promise<MPCard[]> {
    return this.request<MPCard[]>("GET", `/v1/customers/${customerId}/cards`)
  }

  // Gets a charge token from a saved card (for recurring billing — no CVV required)
  async getCardToken(customerId: string, cardId: string): Promise<string> {
    const result = await this.request<{ id: string }>(
      "POST",
      `/v1/customers/${customerId}/cards/${cardId}/token`,
      {}
    )
    return result.id
  }

  async charge(params: {
    token: string
    amount: number
    currencyCode: string
    description: string
    mpCustomerId: string
    externalReference?: string
  }): Promise<MPPayment> {
    const payment = await this.request<MPPayment>("POST", "/v1/payments", {
      token: params.token,
      transaction_amount: params.amount,
      currency_id: params.currencyCode.toUpperCase(),
      description: params.description,
      installments: 1,
      payer: { type: "customer", id: params.mpCustomerId },
      ...(params.externalReference ? { external_reference: params.externalReference } : {}),
    })

    if (payment.status === "rejected") {
      throw new Error(payment.status_detail)
    }

    return payment
  }

  async refund(paymentId: string, amount?: number): Promise<void> {
    await this.request<unknown>("POST", `/v1/payments/${paymentId}/refunds`, amount != null ? { amount } : {})
  }
}
