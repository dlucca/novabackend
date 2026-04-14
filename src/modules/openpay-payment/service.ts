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
    // Pass through the incoming data so updatePaymentSession persists it.
    const data = { ...(input?.data ?? {}) }
    return { data }
  }

  async getPaymentStatus(_input: any): Promise<any> {
    return PaymentSessionStatus.PENDING
  }

  // Supports both Medusa v2.13 single-input form and the legacy 2-arg form used in tests:
  //   v2.13:  authorizePayment({ data: sessionData, context: paymentContext })
  //   legacy: authorizePayment(sessionData, paymentContext)
  //
  // The charge is pre-created in the /complete route handler.
  // This method is a passthrough that confirms the pre-existing charge.
  async authorizePayment(input: any, legacyContext?: any): Promise<any> {
    let paymentSessionData: Record<string, unknown>

    if (legacyContext !== undefined) {
      // Called with 2 args (unit tests)
      paymentSessionData = input ?? {}
    } else {
      // Called with single DTO (Medusa v2.13)
      paymentSessionData = input?.data ?? {}
    }

    const chargeId = paymentSessionData.openpay_charge_id as string | undefined

    if (!chargeId) {
      this.logger_.error("[Openpay] authorizePayment called without openpay_charge_id — charge must be pre-created in route handler")
      return {
        error: "No pre-authorized charge found: openpay_charge_id missing from session data",
        status: PaymentSessionStatus.ERROR,
        data: {},
      }
    }

    this.logger_.info(`[Openpay] authorizePayment passthrough — charge_id=${chargeId}`)
    return {
      status: PaymentSessionStatus.CAPTURED,
      data: { ...paymentSessionData },
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
        amount: refundAmount, // Medusa v2 stores in major units (pesos)
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
