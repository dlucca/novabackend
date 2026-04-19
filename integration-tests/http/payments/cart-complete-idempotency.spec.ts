// novabackend/integration-tests/http/payments/cart-complete-idempotency.spec.ts
import { createTestCart, adminGet, getAdminToken, BACKEND_URL, PUBLISHABLE_KEY } from "../helpers/api"

const OPENPAY_TEST_TOKEN = process.env.OPENPAY_TEST_TOKEN || ""

describe("Cart complete idempotency", () => {
  let adminToken: string

  beforeAll(async () => {
    jest.setTimeout(60_000)
    adminToken = await getAdminToken()
  })

  test("completing the same cart twice results in exactly one order", async () => {
    if (!OPENPAY_TEST_TOKEN) {
      console.warn("OPENPAY_TEST_TOKEN not set — skipping idempotency test")
      return
    }

    const cartId = await createTestCart()

    const firstResp = await fetch(`${BACKEND_URL}/store/carts/${cartId}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ openpay_token_id: OPENPAY_TEST_TOKEN }),
    })
    const firstBody = await firstResp.json()

    if (firstBody.type === "redirect") {
      console.warn("3DS redirect required — skipping idempotency test (3DS cannot be automated)")
      return
    }

    expect(firstResp.status).toBe(200)
    const orderId = firstBody.order?.id
    expect(orderId).toBeDefined()

    const secondResp = await fetch(`${BACKEND_URL}/store/carts/${cartId}/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ openpay_token_id: OPENPAY_TEST_TOKEN }),
    })

    const secondBody = await secondResp.json()
    if (secondResp.status === 200 && secondBody.order) {
      expect(secondBody.order.id).toBe(orderId)
    } else {
      expect([400, 409, 422]).toContain(secondResp.status)
    }

    const { body: ordersBody } = await adminGet(`/admin/orders?cart_id=${cartId}`, adminToken)
    const orders = ordersBody.orders ?? []
    expect(orders.length).toBe(1)
  })
})
