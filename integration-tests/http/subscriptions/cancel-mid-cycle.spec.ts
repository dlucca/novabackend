// novabackend/integration-tests/http/subscriptions/cancel-mid-cycle.spec.ts
import { getAdminToken, adminGet, adminPost, BACKEND_URL, PUBLISHABLE_KEY } from "../helpers/api"

describe("Subscription cancel mid-cycle", () => {
  let adminToken: string

  beforeAll(async () => {
    jest.setTimeout(60_000)
    adminToken = await getAdminToken()
  })

  test("canceling a subscription prevents the next billing cycle from charging", async () => {
    const customerEmail = process.env.TEST_SUBSCRIPTION_CUSTOMER_EMAIL
    const customerPassword = process.env.TEST_SUBSCRIPTION_CUSTOMER_PASSWORD
    if (!customerEmail || !customerPassword) {
      console.warn("TEST_SUBSCRIPTION_CUSTOMER_EMAIL/PASSWORD not set — skipping cancel test")
      return
    }

    const { body: customersBody } = await adminGet(
      `/admin/customers?email=${encodeURIComponent(customerEmail)}`,
      adminToken
    )
    const customer = customersBody.customers?.[0]
    expect(customer).toBeDefined()

    const { body: subsBody } = await adminGet(`/admin/customers/${customer.id}/subscriptions`, adminToken)
    const subscription = subsBody.subscriptions?.find((s: any) => s.status === "active")
    if (!subscription) {
      console.warn("No active subscription found — skipping")
      return
    }

    const subscriptionId = subscription.id

    const storeAuthResp = await fetch(`${BACKEND_URL}/auth/customer/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: customerEmail, password: customerPassword }),
    })
    const { token: customerToken } = await storeAuthResp.json()
    expect(customerToken).toBeDefined()

    const cancelResp = await fetch(`${BACKEND_URL}/store/me/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${customerToken}`,
      },
    })
    expect([200, 201]).toContain(cancelResp.status)

    const { body: refreshedSubsBody } = await adminGet(`/admin/customers/${customer.id}/subscriptions`, adminToken)
    const canceledSub = refreshedSubsBody.subscriptions?.find((s: any) => s.id === subscriptionId)
    expect(canceledSub?.status).toBe("canceled")

    const { body: ordersBeforeBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountBefore = ordersBeforeBody.count ?? ordersBeforeBody.orders?.length ?? 0

    const triggerResp = await adminPost(`/admin/subscriptions/${subscriptionId}/trigger-billing`, adminToken)
    expect([200, 201, 400]).toContain(triggerResp.status)

    await new Promise((r) => setTimeout(r, 2000))

    const { body: ordersAfterBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountAfter = ordersAfterBody.count ?? ordersAfterBody.orders?.length ?? 0
    expect(orderCountAfter).toBe(orderCountBefore)
  })
})
