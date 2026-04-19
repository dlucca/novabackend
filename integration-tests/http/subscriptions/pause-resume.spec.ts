// novabackend/integration-tests/http/subscriptions/pause-resume.spec.ts
import { getAdminToken, adminGet, adminPost, adminPatch, BACKEND_URL, PUBLISHABLE_KEY } from "../helpers/api"

describe("Subscription pause and resume", () => {
  let adminToken: string

  beforeAll(async () => {
    jest.setTimeout(90_000)
    adminToken = await getAdminToken()
  })

  async function getCustomerToken(email: string, password: string): Promise<string> {
    const resp = await fetch(`${BACKEND_URL}/auth/customer/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const { token } = await resp.json()
    return token
  }

  test("paused subscription is not charged; resumed subscription is charged", async () => {
    const customerEmail = process.env.TEST_SUBSCRIPTION_CUSTOMER_EMAIL
    const customerPassword = process.env.TEST_SUBSCRIPTION_CUSTOMER_PASSWORD
    if (!customerEmail || !customerPassword) {
      console.warn("TEST_SUBSCRIPTION_CUSTOMER credentials not set — skipping pause/resume test")
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
    const customerToken = await getCustomerToken(customerEmail, customerPassword)

    const pauseResp = await fetch(`${BACKEND_URL}/store/me/subscriptions/${subscriptionId}/pause`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${customerToken}`,
      },
    })
    expect([200, 201]).toContain(pauseResp.status)

    const { body: pausedSubsBody } = await adminGet(`/admin/customers/${customer.id}/subscriptions`, adminToken)
    const pausedSub = pausedSubsBody.subscriptions?.find((s: any) => s.id === subscriptionId)
    expect(pausedSub?.status).toBe("paused")

    const { body: ordersBeforeBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountBefore = ordersBeforeBody.count ?? ordersBeforeBody.orders?.length ?? 0

    await adminPost(`/admin/subscriptions/${subscriptionId}/trigger-billing`, adminToken)
    await new Promise((r) => setTimeout(r, 2000))

    const { body: ordersAfterPauseBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    expect((ordersAfterPauseBody.count ?? ordersAfterPauseBody.orders?.length ?? 0)).toBe(orderCountBefore)

    const resumeResp = await fetch(`${BACKEND_URL}/store/me/subscriptions/${subscriptionId}/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${customerToken}`,
      },
    })
    expect([200, 201]).toContain(resumeResp.status)

    const { body: resumedSubsBody } = await adminGet(`/admin/customers/${customer.id}/subscriptions`, adminToken)
    const resumedSub = resumedSubsBody.subscriptions?.find((s: any) => s.id === subscriptionId)
    expect(resumedSub?.status).toBe("active")

    const pastDate = new Date(Date.now() - 60_000).toISOString()
    await adminPatch(`/admin/subscriptions/${subscriptionId}`, adminToken, { next_billing_date: pastDate })

    await adminPost(`/admin/subscriptions/${subscriptionId}/trigger-billing`, adminToken)
    await new Promise((r) => setTimeout(r, 3000))

    const { body: ordersAfterResumeBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    expect((ordersAfterResumeBody.count ?? ordersAfterResumeBody.orders?.length ?? 0)).toBe(orderCountBefore + 1)
  })
})
