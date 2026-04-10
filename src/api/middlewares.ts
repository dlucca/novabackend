import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { verifyToken, createClerkClient } from "@clerk/backend"

const clerkMiddleware = async (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid Authorization header" })
    return
  }

  const token = authHeader.replace("Bearer ", "")
  const clerkSecretKey = process.env.CLERK_SECRET_KEY

  if (!clerkSecretKey) {
    // In dev without Clerk configured, skip auth
    ;(req as any).clerk_user_id = "dev-user"
    ;(req as any).clerk_email = "dev@novapatch.care"
    next()
    return
  }

  try {
    const payload = await verifyToken(token, { secretKey: clerkSecretKey })
    const userId = payload.sub

    // The Clerk session JWT does not include email by default — fetch it via API
    const clerk = createClerkClient({ secretKey: clerkSecretKey })
    const user = await clerk.users.getUser(userId)
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? null

    ;(req as any).clerk_user_id = userId
    ;(req as any).clerk_email = email
    next()
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" })
  }
}

const rootRedirectMiddleware = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (req.method === "GET" && req.originalUrl === "/") {
    res.redirect("/app")
    return
  }
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/*",
      middlewares: [rootRedirectMiddleware],
    },
    {
      matcher: "/store/me/*",
      middlewares: [clerkMiddleware],
    },
  ],
})
