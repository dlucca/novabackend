// src/modules/mercadopago-payment/service.ts
import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"
import { MercadoPagoClient } from "./mercadopago-client"

type Options = {
  accessToken: string
  sandbox?: boolean
}

type InjectedDeps = {
  logger: Logger
}

type CustomerContext = {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  metadata?: Record<string, unknown>
}

type PaymentContext = {
  amount?: number
  currency_code?: string
  customer?: CustomerContext
}

export class MercadoPagoPaymentService extends AbstractPaymentProvider<Options> {
  static identifier = "mercadopago"

  protected logger_: Logger
  protected client_: MercadoPagoClient

  constructor(container: InjectedDeps, options: Options) {
    super(container as any, options)
    this.logger_ = container.logger
    this.client_ = new MercadoPagoClient({
      accessToken: options.accessToken,
      sandbox: options.sandbox ?? true,
    })
  }

  async initiatePayment(_input: any): Promise<any> {
    return { data: { status: "pending" } }
  }

  async updatePayment(input: any): Promise<any> {
    const data = { ...(input?.data ?? {}) }
    if (input?.amount != null) data._payment_amount = input.amount
    if (input?.currency_code) data._currency_code = input.currency_code
    return { data }
  }

  async getPaymentStatus(_input: any): Promise<any> {
    return PaymentSessionStatus.PENDING
  }

  // Supports both Medusa v2.13 single-input form and the legacy 2-arg form used in tests:
  //   v2.13:  authorizePayment({ data: sessionData, context: paymentContext })
  //   legacy: authorizePayment(sessionData, paymentContext)
  async authorizePayment(input: any, legacyContext?: any): Promise<any> {
    let paymentSessionData: Record<string, unknown>
    let ctx: PaymentContext

    if (legacyContext !== undefined) {
      paymentSessionData = input ?? {}
      ctx = legacyContext as PaymentContext
    } else {
      paymentSessionData = input?.data ?? {}
      ctx = (input?.context ?? {}) as PaymentContext
    }

    const mpCardToken = paymentSessionData.mp_card_token as string | undefined

    this.logger_.info(`[MP] authorizePayment called. token=${mpCardToken ? "present" : "NONE"}`)

    if (!mpCardToken) {
      this.logger_.error("[MP] MISSING mp_card_token")
      return { error: "Missing mp_card_token in payment session data", status: PaymentSessionStatus.ERROR, data: {} }
    }

    const customer = ctx.customer
    const amountMajor = (paymentSessionData._payment_amount as number) ?? ctx.amount ?? 0
    const currencyCode = ((paymentSessionData._currency_code as string) ?? ctx.currency_code ?? "ars").toUpperCase()

    if (amountMajor <= 0) {
      this.logger_.error(`[MP] INVALID AMOUNT: ${amountMajor}`)
      return { error: "Invalid payment amount: must be greater than 0", status: PaymentSessionStatus.ERROR, data: {} }
    }

    try {
      let mpCustomerId = customer?.metadata?.mp_customer_id as string | undefined

      if (!mpCustomerId) {
        const email = (paymentSessionData._customer_email as string) ?? customer?.email ?? ""
        if (!email) {
          this.logger_.error("[MP] No customer email available")
          return { error: "Customer email is required for payment", status: PaymentSessionStatus.ERROR, data: {} }
        }

        const mpCustomer = await this.client_.getOrCreateCustomer({
          email,
          first_name: (paymentSessionData._customer_name as string) ?? customer?.first_name ?? "Customer",
          last_name: (paymentSessionData._customer_last_name as string) ?? customer?.last_name ?? "",
        })
        mpCustomerId = mpCustomer.id
      }

      const card = await this.client_.createCard(mpCustomerId, mpCardToken)

      const payment = await this.client_.charge({
        token: mpCardToken,
        amount: amountMajor,
        currencyCode,
        description: "Novapatch order",
        mpCustomerId,
        externalReference: paymentSessionData._order_id as string | undefined,
      })

      return {
        status: PaymentSessionStatus.CAPTURED,
        data: {
          mp_payment_id: payment.id,
          mp_customer_id: mpCustomerId,
          mp_card_id: card.id,
          medusa_customer_id: customer?.id,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_.error(`[MP] authorizePayment FAILED: ${message}`)
      return { error: message, status: PaymentSessionStatus.ERROR, data: { error: message } }
    }
  }

  // MP charges are immediate — capture is a no-op
  async capturePayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    return { data }
  }

  async cancelPayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    const paymentId = data.mp_payment_id as string | number | undefined
    if (!paymentId) return { data }
    try {
      await this.client_.refund(String(paymentId))
      return { data: { ...data, mp_status: "refunded" } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_.error(`[MP] cancelPayment failed: ${message}`)
      return { error: message }
    }
  }

  async refundPayment(input: any, legacyAmount?: any): Promise<any> {
    let data: Record<string, unknown>
    let refundAmount: number

    if (legacyAmount !== undefined) {
      data = input ?? {}
      refundAmount = legacyAmount
    } else {
      data = input?.data ?? input ?? {}
      refundAmount = input?.amount ?? 0
    }

    const paymentId = data.mp_payment_id as string | number | undefined
    if (!paymentId) return { data }
    try {
      await this.client_.refund(String(paymentId), refundAmount > 0 ? refundAmount : undefined)
      return { data: { ...data, mp_status: "refunded" } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_.error(`[MP] refundPayment failed: ${message}`)
      return { error: message }
    }
  }

  async retrievePayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    return { data }
  }

  async deletePayment(_input: any): Promise<any> {
    return {}
  }

  async getWebhookActionAndData(_input: any): Promise<any> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default MercadoPagoPaymentService
