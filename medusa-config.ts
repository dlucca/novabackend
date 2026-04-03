import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  admin: {
    disable: true,  // Headless API — admin dashboard not served from this backend
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  modules: [
    {
      resolve: "./src/modules/subscription",
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/openpay-payment",
            id: "openpay",
            options: {
              merchantId: process.env.OPENPAY_MERCHANT_ID ?? "",
              privateKey: process.env.OPENPAY_PRIVATE_KEY ?? "",
              sandbox: process.env.OPENPAY_SANDBOX !== "false",
            },
          },
        ],
      },
    },
  ],
})
