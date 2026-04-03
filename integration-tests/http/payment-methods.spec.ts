import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    OPENPAY_MERCHANT_ID: "",
    OPENPAY_PRIVATE_KEY: "",
    OPENPAY_SANDBOX: "true",
    CLERK_SECRET_KEY: "", // activates dev bypass: clerk_email = dev@novapatch.mx
  },
  testSuite: ({ api, getContainer }) => {
    let publishableApiKey: string

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
      expect(publishableApiKey).toBeTruthy()
    })

    describe("GET /store/me/payment-methods", () => {
      it("returns 401 without Authorization header", async () => {
        const response = await api
          .get("/store/me/payment-methods", {
            headers: { "x-publishable-api-key": publishableApiKey },
          })
          .catch((err: any) => err.response)
        expect(response.status).toBe(401)
      })

      it("returns 200 with empty array for user with no Openpay account", async () => {
        // Dev bypass: clerk_email = dev@novapatch.mx, no customer in DB, no Openpay ID
        const response = await api
          .get("/store/me/payment-methods", {
            headers: {
              Authorization: "Bearer dev-token",
              "x-publishable-api-key": publishableApiKey,
            },
          })
          .catch((err: any) => err.response)
        expect(response.status).toBe(200)
        expect(response.data.payment_methods).toEqual([])
      })
    })

    describe("POST /store/me/payment-methods/default", () => {
      it("returns 401 without Authorization header", async () => {
        const response = await api
          .post(
            "/store/me/payment-methods/default",
            { card_id: "card_1" },
            { headers: { "x-publishable-api-key": publishableApiKey } }
          )
          .catch((err: any) => err.response)
        expect(response.status).toBe(401)
      })

      it("returns 400 when card_id is missing", async () => {
        const response = await api
          .post(
            "/store/me/payment-methods/default",
            {},
            {
              headers: {
                Authorization: "Bearer dev-token",
                "x-publishable-api-key": publishableApiKey,
              },
            }
          )
          .catch((err: any) => err.response)
        expect(response.status).toBe(400)
      })
    })
  },
})
