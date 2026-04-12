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
