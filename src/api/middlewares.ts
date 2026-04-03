import {
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { verifyToken } from "@clerk/backend"

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
    ;(req as any).clerk_email = "dev@novapatch.mx"
    next()
    return
  }

  try {
    const payload = await verifyToken(token, { secretKey: clerkSecretKey })
    ;(req as any).clerk_user_id = payload.sub
    ;(req as any).clerk_email = (payload as any).email || null
    next()
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" })
  }
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/me/*",
      middlewares: [clerkMiddleware],
    },
  ],
})
