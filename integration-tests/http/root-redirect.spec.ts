import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("Root redirect", () => {
      it("GET / returns 302 redirect to /app", async () => {
        const response = await api.get("/", {
          maxRedirects: 0,
          validateStatus: () => true,
        })
        expect(response.status).toEqual(302)
        expect(response.headers["location"]).toEqual("/app")
      })
    })
  },
})
