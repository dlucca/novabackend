import { AbstractPaymentProvider, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"
import { OpenpayClient } from "./openpay-client"

type Options = {
  merchantId: string
  privateKey: string
  sandbox?: boolean   // optional — defaults to true
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

export class OpenpayPaymentService extends AbstractPaymentProvider<Options> {
  static identifier = "openpay"

  protected logger_: Logger
  protected client_: OpenpayClient

  constructor(container: InjectedDeps, options: Options) {
    super(container as any, options)
    this.logger_ = container.logger
    this.client_ = new OpenpayClient({
      merchantId: options.merchantId,
      privateKey: options.privateKey,
      sandbox: options.sandbox ?? true,
    })
  }

  async initiatePayment(_input: any): Promise<any> {
    return { data: { status: "pending" } }
  }

  async updatePayment(input: any): Promise<any> {
    // Pass through the incoming data so updatePaymentSession persists it
    // (e.g. openpay_token_id, device_session_id injected by /complete route).
    // Also save amount/currency in data because authorizePayment doesn't
    // receive them from Medusa's context.
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
      // Called with 2 args (unit tests)
      paymentSessionData = input ?? {}
      ctx = legacyContext as PaymentContext
    } else {
      // Called with single DTO (Medusa v2.13)
      paymentSessionData = input?.data ?? {}
      ctx = (input?.context ?? {}) as PaymentContext
    }

    const openpayTokenId = paymentSessionData.openpay_token_id as string | undefined

    // Use console.log directly — this.logger_ may not appear in Railway logs
    console.log(`[Openpay] authorizePayment called. token=${openpayTokenId ?? "NONE"} sessionData keys=${Object.keys(paymentSessionData).join(",")}`)

    if (!openpayTokenId) {
      console.error("[Openpay] MISSING openpay_token_id")
      return { error: "Missing openpay_token_id in payment session data", status: PaymentSessionStatus.ERROR, data: {} }
    }

    const customer = ctx.customer
    // Amount/currency may come from context OR from session data (saved by updatePayment)
    const amountCentavos = (paymentSessionData._payment_amount as number) ?? ctx.amount ?? 0
    const currencyCode = ((paymentSessionData._currency_code as string) ?? ctx.currency_code ?? "mxn").toUpperCase()

    console.log(`[Openpay] amount=${amountCentavos} currency=${currencyCode} customer=${customer?.email ?? "none"}`)

    if (amountCentavos <= 0) {
      console.error(`[Openpay] INVALID AMOUNT: ${amountCentavos}`)
      return { error: "Invalid payment amount: must be greater than 0", status: PaymentSessionStatus.ERROR, data: {} }
    }

    const amountPesos = amountCentavos / 100
    const deviceSessionId = paymentSessionData.device_session_id as string | undefined

    try {
      let openpayCustomerId = customer?.metadata?.openpay_customer_id as string | undefined

      if (!openpayCustomerId) {
        const openpayCustomer = await this.client_.createCustomer({
          name: customer?.first_name ?? "Customer",
          last_name: customer?.last_name ?? "",
          email: customer?.email ?? "",
        })
        openpayCustomerId = openpayCustomer.id
      }

      const card = await this.client_.storeCard(openpayCustomerId, {
        token_id: openpayTokenId,
        device_session_id: deviceSessionId,
      })

      const charge = await this.client_.chargeCustomerCard(openpayCustomerId, {
        source_id: card.id,
        amount: amountPesos,
        currency: currencyCode,
        description: "Novapatch order",
        device_session_id: deviceSessionId,
      })

      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: {
          openpay_charge_id: charge.id,
          openpay_customer_id: openpayCustomerId,
          openpay_card_id: card.id,
          medusa_customer_id: customer?.id,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[Openpay] authorizePayment FAILED: ${message}`)
      return { error: message, status: PaymentSessionStatus.ERROR, data: { error: message } }
    }
  }

  // Openpay charges are immediate — capture is a no-op
  async capturePayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    return { data }
  }

  async retrievePayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      const charge = await this.client_.getCharge(chargeId)
      return { data: { ...data, openpay_status: charge.status } }
    } catch {
      return { data }
    }
  }

  async cancelPayment(input: any): Promise<any> {
    const data: Record<string, unknown> = input?.data ?? input ?? {}
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      await this.client_.refundCharge(chargeId, { description: "Novapatch cancel" })
      return { data: { ...data, openpay_status: "refunded" } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_?.error(`Openpay cancelPayment failed: ${message}`)
      return { error: message }
    }
  }

  // Supports both v2.13 single-input form and legacy 2-arg form used in tests:
  //   v2.13:  refundPayment({ data, amount })
  //   legacy: refundPayment(data, refundAmountCentavos)
  async refundPayment(input: any, legacyAmount?: any): Promise<any> {
    let data: Record<string, unknown>
    let refundAmount: number

    if (legacyAmount !== undefined) {
      // Called with 2 args (unit tests)
      data = input ?? {}
      refundAmount = legacyAmount
    } else {
      // Called with single DTO (Medusa v2.13)
      data = input?.data ?? input ?? {}
      refundAmount = input?.amount ?? 0
    }

    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      await this.client_.refundCharge(chargeId, {
        description: "Novapatch refund",
        amount: refundAmount / 100,
      })
      return { data: { ...data, openpay_status: "refunded" } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger_?.error(`Openpay refundPayment failed: ${message}`)
      return { error: message }
    }
  }

  async deletePayment(_input: any): Promise<any> {
    // Nothing to delete on Openpay side
    return {}
  }

  async getWebhookActionAndData(_input: any): Promise<any> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default OpenpayPaymentService
