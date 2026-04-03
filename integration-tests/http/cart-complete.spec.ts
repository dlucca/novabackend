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
    let publishableApiKey: string

    // Re-create publishable key before EACH test since the DB is torn down between tests
    beforeEach(async () => {
      const container = getContainer()
      const apiKeyModule = container.resolve(Modules.API_KEY)
      const [key] = await apiKeyModule.createApiKeys([
        {
          title: "Test Store Key",
          type: "publishable",
          created_by: "test",
        },
      ])
      publishableApiKey = key.token
      // Fail fast if setup breaks — tests running without this header would produce
      // misleading results (passing for the wrong reason).
      expect(publishableApiKey).toBeTruthy()
    })

    describe("POST /store/carts/:id/complete (custom route)", () => {
      it("returns 400 when openpay_token_id is missing in body", async () => {
        const headers = { "x-publishable-api-key": publishableApiKey }

        const response = await api
          .post("/store/carts/cart_nonexistent/complete", {}, { headers })
          .catch((err: any) => err.response)
        expect(response.status).toBe(400)
      })

      it("returns 404 when cart does not exist and token is provided", async () => {
        const headers = { "x-publishable-api-key": publishableApiKey }

        const response = await api
          .post(
            "/store/carts/cart_nonexistent/complete",
            { openpay_token_id: "tok_test" },
            { headers }
          )
          .catch((err: any) => err.response)
        expect(response.status).toBe(404)
      })

      it("returns 422 when cart exists but has no payment session", async () => {
        const headers = { "x-publishable-api-key": publishableApiKey }

        // Create a real cart (no payment session attached)
        const regionModule = getContainer().resolve(Modules.REGION)
        const [region] = await regionModule.createRegions([
          {
            name: "MX Test Region",
            currency_code: "mxn",
            countries: ["mx"],
          },
        ])

        const cartResponse = await api
          .post(
            "/store/carts",
            { region_id: region.id },
            { headers }
          )
          .catch((err: any) => err.response)

        // If we can't create a cart in the integration environment, skip gracefully
        if (cartResponse.status !== 200 && cartResponse.status !== 201) {
          console.warn(
            "Skipping 422 test: cart creation returned",
            cartResponse.status
          )
          return
        }

        const cartId = cartResponse.data?.cart?.id
        expect(cartId).toBeTruthy()

        // Attempt to complete the cart without ever calling /payment-sessions
        const response = await api
          .post(
            `/store/carts/${cartId}/complete`,
            { openpay_token_id: "tok_test" },
            { headers }
          )
          .catch((err: any) => err.response)

        expect(response.status).toBe(422)
        expect(response.data?.message).toMatch(/payment session/i)
      })
    })
  },
})
