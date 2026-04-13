// src/__tests__/workflows/subscription-state-machine.unit.spec.ts
//
// Tests for cancel, pause, resume, and update-frequency steps.
// Each step's logic is inlined as a function accepting the subscription service.

import { MedusaError } from "@medusajs/framework/utils"

// ── Service mock ──────────────────────────────────────────────────────────────

const mockSubscriptionService = {
  retrieveSubscription: jest.fn(),
  updateSubscriptions: jest.fn(),
}

function makeService() {
  return mockSubscriptionService
}

// cancelSubscriptionStep
async function runCancel(service: typeof mockSubscriptionService, input: { subscription_id: string }) {
  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status === "canceled") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Subscription is already canceled")
  }

  const previousStatus = subscription.status
  const previousNextBillingDate = subscription.next_billing_date

  await service.updateSubscriptions({ id: input.subscription_id, status: "canceled" })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    compensationData: {
      subscription_id: input.subscription_id,
      previous_status: previousStatus,
      previous_next_billing_date: previousNextBillingDate,
    },
  }
}

async function runCancelCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_status: string; previous_next_billing_date: any } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    status: compensationData.previous_status,
    next_billing_date: compensationData.previous_next_billing_date,
  })
}

// pauseSubscriptionStep
async function runPause(service: typeof mockSubscriptionService, input: { subscription_id: string }) {
  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status !== "active") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Only active subscriptions can be paused. Current status: ${subscription.status}`
    )
  }

  const previousStatus = subscription.status
  await service.updateSubscriptions({ id: input.subscription_id, status: "paused" })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    compensationData: { subscription_id: input.subscription_id, previous_status: previousStatus },
  }
}

async function runPauseCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_status: string } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    status: compensationData.previous_status,
  })
}

// resumeSubscriptionStep
async function runResume(service: typeof mockSubscriptionService, input: { subscription_id: string }) {
  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status !== "paused") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Only paused subscriptions can be resumed. Current status: ${subscription.status}`
    )
  }

  const previousStatus = subscription.status
  const previousNextBillingDate = subscription.next_billing_date

  const newNextBillingDate = new Date()
  newNextBillingDate.setDate(newNextBillingDate.getDate() + subscription.interval_days)

  await service.updateSubscriptions({
    id: input.subscription_id,
    status: "active",
    next_billing_date: newNextBillingDate,
  })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    newNextBillingDate,
    compensationData: {
      subscription_id: input.subscription_id,
      previous_status: previousStatus,
      previous_next_billing_date: previousNextBillingDate,
    },
  }
}

async function runResumeCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_status: string; previous_next_billing_date: any } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    status: compensationData.previous_status,
    next_billing_date: compensationData.previous_next_billing_date,
  })
}

// updateFrequencyStep
const VALID_INTERVALS = [30, 60, 90]

async function runUpdateFrequency(
  service: typeof mockSubscriptionService,
  input: { subscription_id: string; interval_days: number }
) {
  if (!VALID_INTERVALS.includes(input.interval_days)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `interval_days must be one of ${VALID_INTERVALS.join(", ")}. Received: ${input.interval_days}`
    )
  }

  const subscription = await service.retrieveSubscription(input.subscription_id)

  if (subscription.status !== "active" && subscription.status !== "paused") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Cannot change frequency on a subscription with status: ${subscription.status}. Must be active or paused.`
    )
  }

  const previousIntervalDays = subscription.interval_days
  await service.updateSubscriptions({ id: input.subscription_id, interval_days: input.interval_days })
  const updated = await service.retrieveSubscription(input.subscription_id)

  return {
    result: updated,
    compensationData: { subscription_id: input.subscription_id, previous_interval_days: previousIntervalDays },
  }
}

async function runUpdateFrequencyCompensation(
  service: typeof mockSubscriptionService,
  compensationData: { subscription_id: string; previous_interval_days: number } | null
) {
  if (!compensationData) return
  await service.updateSubscriptions({
    id: compensationData.subscription_id,
    interval_days: compensationData.previous_interval_days,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const SUB_ID = "sub_1"

describe("cancelSubscriptionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID,
      status: "active",
      next_billing_date: new Date("2026-05-01"),
      interval_days: 30,
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("active → calls updateSubscriptions with status canceled", async () => {
    await runCancel(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "canceled" })
    )
  })

  it("paused → calls updateSubscriptions with status canceled", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "paused", next_billing_date: new Date("2026-05-01"), interval_days: 30,
    })
    await runCancel(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    )
  })

  it("already canceled → throws MedusaError INVALID_DATA", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "canceled", interval_days: 30,
    })
    await expect(runCancel(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Subscription is already canceled"
    )
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })

  it("compensation → restores previous_status and previous_next_billing_date", async () => {
    const prevDate = new Date("2026-04-15")
    await runCancelCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_status: "active",
      previous_next_billing_date: prevDate,
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      status: "active",
      next_billing_date: prevDate,
    })
  })

  it("compensation with null → does not call updateSubscriptions", async () => {
    await runCancelCompensation(makeService(), null)
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })
})

describe("pauseSubscriptionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "active", interval_days: 30,
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("active → calls updateSubscriptions with status paused", async () => {
    await runPause(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "paused" })
    )
  })

  it("paused → throws INVALID_DATA (only active can be paused)", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "paused", interval_days: 30,
    })
    await expect(runPause(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Only active subscriptions can be paused"
    )
  })

  it("canceled → throws INVALID_DATA", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "canceled", interval_days: 30,
    })
    await expect(runPause(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Only active subscriptions can be paused"
    )
  })

  it("compensation → restores previous_status", async () => {
    await runPauseCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_status: "active",
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      status: "active",
    })
  })

  it("compensation with null → does not call updateSubscriptions", async () => {
    await runPauseCompensation(makeService(), null)
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })
})

describe("resumeSubscriptionStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID,
      status: "paused",
      interval_days: 30,
      next_billing_date: new Date("2026-03-01"),
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("paused → calls updateSubscriptions with status active", async () => {
    await runResume(makeService(), { subscription_id: SUB_ID })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, status: "active" })
    )
  })

  it("paused → next_billing_date = today + interval_days", async () => {
    const before = new Date()
    const { newNextBillingDate } = await runResume(makeService(), { subscription_id: SUB_ID })
    const expectedMin = new Date(before)
    expectedMin.setDate(expectedMin.getDate() + 30)
    expectedMin.setSeconds(expectedMin.getSeconds() - 1)
    const expectedMax = new Date(before)
    expectedMax.setDate(expectedMax.getDate() + 30)
    expectedMax.setSeconds(expectedMax.getSeconds() + 1)
    expect(newNextBillingDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime())
    expect(newNextBillingDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime())
  })

  it("active → throws INVALID_DATA (only paused can be resumed)", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "active", interval_days: 30,
    })
    await expect(runResume(makeService(), { subscription_id: SUB_ID })).rejects.toThrow(
      "Only paused subscriptions can be resumed"
    )
  })

  it("compensation → restores previous_status and previous_next_billing_date", async () => {
    const prevDate = new Date("2026-03-01")
    await runResumeCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_status: "paused",
      previous_next_billing_date: prevDate,
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      status: "paused",
      next_billing_date: prevDate,
    })
  })

  it("compensation with null → does not call updateSubscriptions", async () => {
    await runResumeCompensation(makeService(), null)
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })
})

describe("updateFrequencyStep", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "active", interval_days: 30,
    })
    mockSubscriptionService.updateSubscriptions.mockResolvedValue(undefined)
  })

  it("interval_days=30 → calls updateSubscriptions with interval_days=30", async () => {
    await runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 30 })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: SUB_ID, interval_days: 30 })
    )
  })

  it("interval_days=60 → calls updateSubscriptions with interval_days=60", async () => {
    await runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 60 })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ interval_days: 60 })
    )
  })

  it("interval_days=45 → throws INVALID_DATA", async () => {
    await expect(
      runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 45 })
    ).rejects.toThrow("interval_days must be one of 30, 60, 90")
    expect(mockSubscriptionService.updateSubscriptions).not.toHaveBeenCalled()
  })

  it("canceled subscription → throws INVALID_DATA", async () => {
    mockSubscriptionService.retrieveSubscription.mockResolvedValue({
      id: SUB_ID, status: "canceled", interval_days: 30,
    })
    await expect(
      runUpdateFrequency(makeService(), { subscription_id: SUB_ID, interval_days: 60 })
    ).rejects.toThrow("Cannot change frequency")
  })

  it("compensation → restores previous_interval_days", async () => {
    await runUpdateFrequencyCompensation(makeService(), {
      subscription_id: SUB_ID,
      previous_interval_days: 30,
    })
    expect(mockSubscriptionService.updateSubscriptions).toHaveBeenCalledWith({
      id: SUB_ID,
      interval_days: 30,
    })
  })
})
