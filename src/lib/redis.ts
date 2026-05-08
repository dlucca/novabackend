// src/lib/redis.ts
import Redis from "ioredis"

let client: Redis | null = null

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!client) {
    client = new Redis(url, { maxRetriesPerRequest: 1 })
  }
  return client
}

export const TRACKING_KEY_PREFIX = "envia:tracking:"
export const TRACKING_KEY_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

// Influencer-sample shipping lock — prevents the same approved application
// from generating multiple Envia labels if the admin double-clicks or the
// browser retries the request mid-flight. 5-min TTL so the lock self-heals
// if the workflow crashes without explicit release.
export const INFLUENCER_SHIP_LOCK_PREFIX = "influencer:ship:lock:"
export const INFLUENCER_SHIP_LOCK_TTL_SECONDS = 300

/**
 * Tries to acquire a distributed lock for shipping samples for the given
 * application. Returns true if we got it, false if someone else holds it.
 *
 * Uses Redis SET NX so the operation is atomic — even with concurrent
 * workers, only one acquires the lock.
 *
 * If Redis is not configured, returns true (no locking — best-effort dev mode).
 */
export async function acquireInfluencerShipLock(
  applicationId: string
): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) return true
  const key = `${INFLUENCER_SHIP_LOCK_PREFIX}${applicationId}`
  const result = await redis.set(key, "1", "EX", INFLUENCER_SHIP_LOCK_TTL_SECONDS, "NX")
  return result === "OK"
}

/**
 * Best-effort lock release. Safe to call even if the lock wasn't acquired
 * (Redis DEL on a missing key is a no-op).
 */
export async function releaseInfluencerShipLock(
  applicationId: string
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  const key = `${INFLUENCER_SHIP_LOCK_PREFIX}${applicationId}`
  try {
    await redis.del(key)
  } catch {
    // Best-effort — TTL will clean it up if delete fails
  }
}
