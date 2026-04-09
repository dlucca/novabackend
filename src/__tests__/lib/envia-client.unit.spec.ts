// src/__tests__/lib/envia-client.unit.spec.ts
import { withRetry, isRetryable } from "../../lib/envia-client"

describe("isRetryable", () => {
  it("returns true for 5xx status codes", () => {
    const err = Object.assign(new Error("server error"), { statusCode: 503 })
    expect(isRetryable(err)).toBe(true)
  })

  it("returns true for timeout errors", () => {
    const err = new Error("Request timeout")
    expect(isRetryable(err)).toBe(true)
  })

  it("returns true for ECONNRESET", () => {
    const err = new Error("ECONNRESET")
    expect(isRetryable(err)).toBe(true)
  })

  it("returns false for 4xx status codes", () => {
    const err = Object.assign(new Error("bad request"), { statusCode: 422 })
    expect(isRetryable(err)).toBe(false)
  })

  it("returns false for non-Error values", () => {
    expect(isRetryable("some string")).toBe(false)
    expect(isRetryable(null)).toBe(false)
  })
})

describe("withRetry", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("returns result on first successful attempt", async () => {
    const fn = jest.fn().mockResolvedValue("ok")
    const result = await withRetry(fn)
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on retryable error and eventually succeeds", async () => {
    const retryableErr = Object.assign(new Error("5xx"), { statusCode: 503 })
    const fn = jest.fn()
      .mockRejectedValueOnce(retryableErr)
      .mockResolvedValue("ok")

    const promise = withRetry(fn, 3)
    await jest.runAllTimersAsync()
    const result = await promise
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("does not retry on non-retryable error", async () => {
    const err = Object.assign(new Error("4xx"), { statusCode: 400 })
    const fn = jest.fn().mockRejectedValue(err)

    const promise = withRetry(fn, 3)
    await jest.runAllTimersAsync()
    await expect(promise).rejects.toThrow("4xx")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("throws after exhausting max attempts", async () => {
    const err = Object.assign(new Error("503"), { statusCode: 503 })
    const fn = jest.fn().mockRejectedValue(err)

    const promise = withRetry(fn, 3)
    await jest.runAllTimersAsync()
    await expect(promise).rejects.toThrow("503")
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
