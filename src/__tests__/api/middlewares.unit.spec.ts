const mockNext = jest.fn()
const mockRes = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
}

function makeMiddleware(clerkSecretKey: string | undefined, nodeEnv: string) {
  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers?.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Missing or invalid Authorization header" })
      return
    }
    if (!clerkSecretKey) {
      if (nodeEnv === "production") {
        res.status(503).json({ message: "Authentication service not configured" })
        return
      }
      ;(req as any).clerk_user_id = "dev-user"
      ;(req as any).clerk_email = "dev@novapatch.care"
      next()
      return
    }
  }
}

describe("clerkMiddleware", () => {
  beforeEach(() => { mockNext.mockClear(); mockRes.status.mockClear(); mockRes.json.mockClear() })

  it("returns 401 when Authorization header is missing", async () => {
    const mw = makeMiddleware("sk_test_abc", "development")
    await mw({ headers: {} }, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it("returns 503 in production when CLERK_SECRET_KEY is missing", async () => {
    const mw = makeMiddleware(undefined, "production")
    await mw({ headers: { authorization: "Bearer tok" } }, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(503)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it("passes dev-user in development when CLERK_SECRET_KEY is missing", async () => {
    const req: any = { headers: { authorization: "Bearer tok" } }
    const mw = makeMiddleware(undefined, "development")
    await mw(req, mockRes, mockNext)
    expect(req.clerk_user_id).toBe("dev-user")
    expect(mockNext).toHaveBeenCalled()
  })
})
