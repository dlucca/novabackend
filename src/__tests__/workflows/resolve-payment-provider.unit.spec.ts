// src/__tests__/workflows/resolve-payment-provider.unit.spec.ts

describe("resolvePaymentProviderStepFn", () => {
  function makeContainer(subscriptionData: any, orderData: any) {
    return {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === "logger") return { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
        if (key === "subscriptionModuleService") {
          return { retrieveSubscription: jest.fn().mockResolvedValue(subscriptionData) }
        }
        if (key === "order") {
          return { retrieveOrder: jest.fn().mockResolvedValue(orderData) }
        }
        throw new Error(`Unknown module: ${key}`)
      }),
    }
  }

  it("returns provider_id from the first payment session", async () => {
    const subscription = { id: "sub_1", original_order_id: "order_1" }
    const order = {
      id: "order_1",
      payment_collections: [{ payment_sessions: [{ provider_id: "pp_openpay_openpay" }] }],
    }
    const container = makeContainer(subscription, order)
    const { resolvePaymentProviderStepFn } = await import(
      "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
    )
    const result = await resolvePaymentProviderStepFn({ subscription_id: "sub_1" }, { container })
    expect(result.provider_id).toBe("pp_openpay_openpay")
  })

  it("returns pp_mercadopago when that is the provider", async () => {
    const subscription = { id: "sub_2", original_order_id: "order_2" }
    const order = {
      id: "order_2",
      payment_collections: [{ payment_sessions: [{ provider_id: "pp_mercadopago_mercadopago" }] }],
    }
    const container = makeContainer(subscription, order)
    const { resolvePaymentProviderStepFn } = await import(
      "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
    )
    const result = await resolvePaymentProviderStepFn({ subscription_id: "sub_2" }, { container })
    expect(result.provider_id).toBe("pp_mercadopago_mercadopago")
  })

  it("returns pp_openpay as fallback when no payment collection", async () => {
    const subscription = { id: "sub_1", original_order_id: "order_1" }
    const order = { id: "order_1", payment_collections: [] }
    const container = makeContainer(subscription, order)
    const { resolvePaymentProviderStepFn } = await import(
      "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
    )
    const result = await resolvePaymentProviderStepFn({ subscription_id: "sub_1" }, { container })
    expect(result.provider_id).toBe("pp_openpay_openpay")
  })

  it("returns pp_openpay as fallback when no original_order_id", async () => {
    const subscription = { id: "sub_1", original_order_id: null }
    const container = makeContainer(subscription, null)
    const { resolvePaymentProviderStepFn } = await import(
      "../../workflows/process-billing-cycle/steps/resolve-payment-provider"
    )
    const result = await resolvePaymentProviderStepFn({ subscription_id: "sub_1" }, { container })
    expect(result.provider_id).toBe("pp_openpay_openpay")
  })
})
