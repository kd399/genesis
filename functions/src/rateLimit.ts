import { db } from './admin'
import { FieldValue } from 'firebase-admin/firestore'

interface RateLimitConfig {
  windowMs: number // time window in ms
  maxRequests: number
}

/**
 * Simple Firestore-backed rate limiter.
 * Returns true if the request is allowed, false if rate limit exceeded.
 *
 * Uses a sliding window counter stored per (uid, endpoint) in Firestore.
 * Each document stores the window start time and request count.
 */
export async function checkRateLimit(
  uid: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const key = `${uid}__${endpoint}`
  const ref = db.collection('_rateLimits').doc(key)
  const now = Date.now()

  try {
    const result = await db.runTransaction(async tx => {
      const doc = await tx.get(ref)

      if (!doc.exists) {
        // First request — create window
        tx.set(ref, {
          uid,
          endpoint,
          count: 1,
          windowStart: now,
          updatedAt: FieldValue.serverTimestamp()
        })
        return { allowed: true, remaining: config.maxRequests - 1, resetMs: now + config.windowMs }
      }

      const data = doc.data()!
      const windowStart: number = data.windowStart
      const count: number = data.count

      if (now - windowStart > config.windowMs) {
        // Window expired — reset
        tx.set(ref, {
          uid,
          endpoint,
          count: 1,
          windowStart: now,
          updatedAt: FieldValue.serverTimestamp()
        })
        return { allowed: true, remaining: config.maxRequests - 1, resetMs: now + config.windowMs }
      }

      if (count >= config.maxRequests) {
        // Limit exceeded
        return {
          allowed: false,
          remaining: 0,
          resetMs: windowStart + config.windowMs
        }
      }

      // Increment counter
      tx.update(ref, {
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      })
      return {
        allowed: true,
        remaining: config.maxRequests - count - 1,
        resetMs: windowStart + config.windowMs
      }
    })

    return result
  } catch {
    // On error, allow the request (fail open) to avoid blocking legitimate traffic
    return { allowed: true, remaining: 0, resetMs: now + config.windowMs }
  }
}

// Pre-configured limiters
export const RATE_LIMITS = {
  // generateStream: 10 requests per minute per user
  generateStream: { windowMs: 60_000, maxRequests: 10 },
  // highlevelProxy: 60 requests per minute per user
  highlevelProxy: { windowMs: 60_000, maxRequests: 60 }
} as const
