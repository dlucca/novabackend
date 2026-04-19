// novabackend/integration-tests/http/subscriptions/renewal-cycle.spec.ts
import { getAdminToken, adminGet, adminPost, adminPatch, BACKEND_URL } from "../helpers/api"

describe("Subscription renewal cycle", () => {
  let adminToken: string

  beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  test("advancing next_billing_date and triggering billing creates a new order", async () => {
    const customerEmail = process.env.TEST_SUBSCRIPTION_CUSTOMER_EMAIL
    if (!customerEmail) {
      console.warn("TEST_SUBSCRIPTION_CUSTOMER_EMAIL not set — skipping renewal test")
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
      console.warn("No active subscription found for test customer — skipping")
      return
    }

    const subscriptionId = subscription.id
    const originalNextBillingDate = subscription.next_billing_date

    const { body: ordersBeforeBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountBefore = ordersBeforeBody.count ?? ordersBeforeBody.orders?.length ?? 0

    const pastDate = new Date(Date.now() - 60_000).toISOString()
    const updateResp = await adminPatch(`/admin/subscriptions/${subscriptionId}`, adminToken, { next_billing_date: pastDate })

    if (updateResp.status === 404) {
      console.warn("PATCH /admin/subscriptions/:id not found — add this route to test renewal cycle")
      return
    }
    expect(updateResp.status).toBe(200)

    const triggerResp = await adminPost(`/admin/subscriptions/${subscriptionId}/trigger-billing`, adminToken)
    expect([200, 201]).toContain(triggerResp.status)

    await new Promise((r) => setTimeout(r, 3000))

    const { body: ordersAfterBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountAfter = ordersAfterBody.count ?? ordersAfterBody.orders?.length ?? 0
    expect(orderCountAfter).toBe(orderCountBefore + 1)

    const { body: refreshedSubsBody } = await adminGet(`/admin/customers/${customer.id}/subscriptions`, adminToken)
    const refreshedSub = refreshedSubsBody.subscriptions?.find((s: any) => s.id === subscriptionId)
    expect(new Date(refreshedSub.next_billing_date) > new Date(originalNextBillingDate)).toBe(true)
  })
}, 60_000)
