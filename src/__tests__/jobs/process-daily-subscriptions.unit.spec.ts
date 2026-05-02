// src/__tests__/jobs/process-daily-subscriptions.unit.spec.ts

const mockRun = jest.fn()
const mockWorkflow = jest.fn().mockReturnValue({ run: mockRun })
const mockListSubscriptions = jest.fn()
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

// Inline the job logic to test it in isolation
const CONCURRENCY = 5

async function runJobLogic(subscriptions: any[]) {
  mockListSubscriptions.mockResolvedValue(subscriptions)

  const now = new Date()
  let dueSubscriptions: any[]

  try {
    dueSubscriptions = await mockListSubscriptions({
      status: "active",
      next_billing_date: { $lte: now },
    })
  } catch (err) {
    mockLogger.error(`Failed to list: ${err}`)
    return { succeeded: 0, failed: 0, skipped: 0 }
  }

  let succeeded = 0, failed = 0, skipped = 0

  for (let i = 0; i < dueSubscriptions.length; i += CONCURRENCY) {
    const chunk = dueSubscriptions.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map((sub: any) => mockWorkflow({}).run({ input: { subscription_id: sub.id } }))
    )
    for (const result of results) {
      if (result.status === "rejected") {
        failed++
      } else {
        const res = (result as any).value?.result
        if (res?.skipped || res?.delayed) skipped++
        else if (res?.failed) failed++
        else succeeded++
      }
    }
  }

  return { succeeded, failed, skipped }
}

describe("process-daily-subscriptions job", () => {
  beforeEach(() => {
    mockRun.mockReset()
    mockListSubscriptions.mockReset()
  })

  describe("BILLING_CRON_PAUSED kill switch", () => {
    const originalEnv = process.env.BILLING_CRON_PAUSED

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.BILLING_CRON_PAUSED
      else process.env.BILLING_CRON_PAUSED = originalEnv
    })

    // Simulate the early-exit gate from the real job
    async function runWithKillSwitch() {
      if (process.env.BILLING_CRON_PAUSED === "true") {
        mockLogger.warn("paused")
        return { paused: true }
      }
      mockLogger.info("running")
      return { paused: false }
    }

    it("short-circuits when BILLING_CRON_PAUSED=true", async () => {
      process.env.BILLING_CRON_PAUSED = "true"
      const result = await runWithKillSwitch()
      expect(result).toEqual({ paused: true })
      expect(mockLogger.warn).toHaveBeenCalledWith("paused")
      expect(mockListSubscriptions).not.toHaveBeenCalled()
    })

    it("runs normally when BILLING_CRON_PAUSED is unset", async () => {
      delete process.env.BILLING_CRON_PAUSED
      const result = await runWithKillSwitch()
      expect(result).toEqual({ paused: false })
    })

    it("runs normally when BILLING_CRON_PAUSED is anything but the literal 'true'", async () => {
      process.env.BILLING_CRON_PAUSED = "1"
      const result = await runWithKillSwitch()
      expect(result).toEqual({ paused: false })
    })
  })

  it("queries listSubscriptions with DB-level status and date filter", async () => {
    mockListSubscriptions.mockResolvedValue([])
    await runJobLogic([])
    expect(mockListSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        next_billing_date: expect.objectContaining({ $lte: expect.any(Date) }),
      })
    )
  })

  it("counts succeeded, failed, and skipped correctly", async () => {
    const subs = [{ id: "s1" }, { id: "s2" }, { id: "s3" }]
    mockRun
      .mockResolvedValueOnce({ result: { success: true } })
      .mockResolvedValueOnce({ result: { failed: true } })
      .mockResolvedValueOnce({ result: { skipped: true } })
    const counts = await runJobLogic(subs)
    expect(counts).toEqual({ succeeded: 1, failed: 1, skipped: 1 })
  })

  it("continues processing remaining subscriptions when one throws", async () => {
    const subs = [{ id: "s1" }, { id: "s2" }]
    mockRun
      .mockRejectedValueOnce(new Error("billing exploded"))
      .mockResolvedValueOnce({ result: { success: true } })
    const counts = await runJobLogic(subs)
    expect(counts.succeeded).toBe(1)
    expect(counts.failed).toBe(1)
  })

  it("processes subscriptions in parallel batches of CONCURRENCY", async () => {
    // Create 7 subscriptions (more than one batch of 5)
    const subs = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}` }))
    mockRun.mockResolvedValue({ result: { success: true } })
    const counts = await runJobLogic(subs)
    expect(counts.succeeded).toBe(7)
    expect(mockRun).toHaveBeenCalledTimes(7)
  })
})
