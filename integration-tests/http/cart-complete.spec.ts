import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    OPENPAY_MERCHANT_ID: "",
    OPENPAY_PRIVATE_KEY: "",
    OPENPAY_SANDBOX: "true",
    CLERK_SECRET_KEY: "",
  },
  testSuite: ({ api, getContainer }) => {
    let pubKey: string | null = null

    // Re-create publishable key before EACH test since the DB is torn down between tests
    beforeEach(async () => {
      try {
        const container = getContainer()
        const apiKeyModule = container.resolve(Modules.API_KEY)
        const [key] = await apiKeyModule.createApiKeys([
          {
            title: "Test Store Key",
            type: "publishable",
            created_by: "test",
          },
        ])
        pubKey = key.token
      } catch (err: any) {
        console.error("BEFORE_EACH_ERROR:", err?.message)
        pubKey = null
      }
    })

    describe("POST /store/carts/:id/complete (custom route)", () => {
      it("returns 400 when openpay_token_id is missing in body", async () => {
        const headers: Record<string, string> = {}
        if (pubKey) headers["x-publishable-api-key"] = pubKey

        const response = await api
          .post("/store/carts/cart_nonexistent/complete", {}, { headers })
          .catch((err: any) => err.response)
        expect(response.status).toBe(400)
      })

      it("returns 404 when cart does not exist and token is provided", async () => {
        const headers: Record<string, string> = {}
        if (pubKey) headers["x-publishable-api-key"] = pubKey

        const response = await api
          .post(
            "/store/carts/cart_nonexistent/complete",
            { openpay_token_id: "tok_test" },
            { headers }
          )
          .catch((err: any) => err.response)
        expect(response.status).toBe(404)
      })
    })
  },
})
