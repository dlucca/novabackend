// novabackend/integration-tests/http/jobs/bullmq-idempotency.spec.ts
import { getAdminToken, adminGet, adminPost, adminPatch } from "../helpers/api"

describe("BullMQ billing idempotency", () => {
  let adminToken: string

  beforeAll(async () => {
    adminToken = await getAdminToken()
  })

  test("triggering billing twice for the same subscription creates only one order", async () => {
    const customerEmail = process.env.TEST_SUBSCRIPTION_CUSTOMER_EMAIL
    if (!customerEmail) {
      console.warn("TEST_SUBSCRIPTION_CUSTOMER_EMAIL not set — skipping idempotency test")
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

    const pastDate = new Date(Date.now() - 60_000).toISOString()
    await adminPatch(`/admin/subscriptions/${subscriptionId}`, adminToken, { next_billing_date: pastDate })

    const { body: ordersBeforeBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountBefore = ordersBeforeBody.count ?? ordersBeforeBody.orders?.length ?? 0

    await Promise.all([
      adminPost(`/admin/subscriptions/${subscriptionId}/trigger-billing`, adminToken),
      adminPost(`/admin/subscriptions/${subscriptionId}/trigger-billing`, adminToken),
    ])

    await new Promise((r) => setTimeout(r, 5000))

    const { body: ordersAfterBody } = await adminGet(`/admin/orders?customer_id=${customer.id}&limit=50`, adminToken)
    const orderCountAfter = ordersAfterBody.count ?? ordersAfterBody.orders?.length ?? 0
    expect(orderCountAfter).toBe(orderCountBefore + 1)

    const { body: refreshedSubsBody } = await adminGet(`/admin/customers/${customer.id}/subscriptions`, adminToken)
    const refreshedSub = refreshedSubsBody.subscriptions?.find((s: any) => s.id === subscriptionId)
    expect(new Date(refreshedSub.next_billing_date) > new Date(pastDate)).toBe(true)
  })
}, 60_000)
