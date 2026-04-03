import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/types"
import { OpenpayClient } from "./openpay-client"

type Options = {
  merchantId: string
  privateKey: string
  sandbox: boolean
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

  async initiatePayment(): Promise<{ data: Record<string, unknown> }> {
    return { data: { status: "pending" } }
  }

  async updatePaymentSession(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    return { data }
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<
    | { error: string; code?: string; detail?: string }
    | { status: PaymentSessionStatus; data: Record<string, unknown> }
  > {
    const openpayTokenId = paymentSessionData.openpay_token_id as string | undefined
    if (!openpayTokenId) {
      return { error: "Missing openpay_token_id in payment session data" }
    }

    const ctx = context as PaymentContext
    const customer = ctx.customer
    const amountCentavos = ctx.amount ?? 0
    const amountPesos = amountCentavos / 100
    const currencyCode = (ctx.currency_code ?? "mxn").toUpperCase()
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
      this.logger_?.error(`Openpay authorizePayment failed: ${message}`)
      return { error: message }
    }
  }

  // Openpay charges are immediate — capture is a no-op
  async capturePayment(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    return { data }
  }

  async retrievePayment(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      const charge = await this.client_.getCharge(chargeId)
      return { data: { ...data, openpay_status: charge.status } }
    } catch {
      return { data }
    }
  }

  async cancelPayment(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    try {
      await this.client_.refundCharge(chargeId, { description: "Novapatch cancel" })
      return { data: { ...data, openpay_status: "refunded" } }
    } catch (err) {
      this.logger_?.error(`Openpay cancelPayment failed: ${err instanceof Error ? err.message : err}`)
      return { data }
    }
  }

  async refundPayment(data: Record<string, unknown>, refundAmount: number): Promise<{ data: Record<string, unknown> }> {
    const chargeId = data.openpay_charge_id as string | undefined
    if (!chargeId) return { data }
    await this.client_.refundCharge(chargeId, {
      description: "Novapatch refund",
      amount: refundAmount / 100,
    })
    return { data: { ...data, openpay_status: "refunded" } }
  }

  async deletePayment(): Promise<void> {
    // Nothing to delete on Openpay side
  }

  async getWebhookActionAndData() {
    return { action: "not_supported" as any }
  }
}

export default OpenpayPaymentService
