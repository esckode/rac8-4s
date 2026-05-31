import { Request, Response, NextFunction } from 'express'
import { getLogger } from '../logger'

const log = getLogger('rate-limit')

/**
 * Represents a rate limit entry tracking attempt history.
 */
interface RateLimitEntry {
  attempts: number
  firstAttemptAt: number
  lastAttemptAt: number
}

/**
 * In-memory store for rate limit entries.
 * In production with multiple servers, use Redis instead.
 */
const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Options for rate limit middleware.
 */
export interface RateLimitOptions {
  /** Maximum attempts allowed within the time window */
  maxAttempts: number
  /** Time window in milliseconds */
  windowMs: number
  /** Optional: key prefix for debugging (e.g., 'login', 'forgot-password') */
  prefix?: string
  /**
   * Whether to count all requests or only failed requests.
   * - 'all': count every request (useful for forgot-password)
   * - 'failures': count only 4xx/5xx errors (useful for login attempts)
   * Default: 'failures'
   */
  countMode?: 'all' | 'failures'
}

/**
 * Function to extract rate limit key from request.
 * Examples:
 *   - Login: (req) => `login:${req.body.email}:${req.ip}`
 *   - Forgot password: (req) => `forgot:${req.body.email}`
 */
export type KeyGenerator = (req: Request) => string

/**
 * Periodic cleanup to remove expired rate limit entries.
 * Runs every 5 minutes to prevent unbounded memory growth.
 */
let cleanupIntervalId: NodeJS.Timeout | null = null

function startCleanupInterval(): void {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(() => {
    const now = Date.now()
    const maxWindowMs = 15 * 60 * 1000 // 15 minutes - reasonable max for any window

    let deletedCount = 0
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.lastAttemptAt > maxWindowMs) {
        rateLimitStore.delete(key)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      log.debug('rate_limit.cleanup', { deletedCount, remaining: rateLimitStore.size })
    }
  }, 5 * 60 * 1000) // Every 5 minutes
}

/**
 * Stop the cleanup interval (useful for tests).
 */
export function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }
}

/**
 * Clear all rate limit entries (useful for tests).
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear()
}

/**
 * Create a rate limit middleware.
 *
 * Tracks requests by a custom key and returns 429 when limit exceeded.
 * Only increments counter on failed responses (status >= 400).
 * On successful response (status < 400), clears the counter.
 *
 * @param keyGenerator Function to extract rate limit key from request
 * @param options Rate limit configuration
 * @returns Express middleware
 *
 * @example
 * // Rate limit login by email + IP
 * router.post('/login',
 *   createRateLimitMiddleware(
 *     (req) => `login:${req.body.email}:${req.ip}`,
 *     { maxAttempts: 5, windowMs: 15 * 60 * 1000, prefix: 'login' }
 *   ),
 *   loginHandler
 * )
 *
 * @example
 * // Rate limit forgot-password by email
 * router.post('/forgot-password',
 *   createRateLimitMiddleware(
 *     (req) => `forgot:${req.body.email}`,
 *     { maxAttempts: 5, windowMs: 15 * 60 * 1000, prefix: 'forgot' }
 *   ),
 *   forgotHandler
 * )
 */
export function createRateLimitMiddleware(
  keyGenerator: KeyGenerator,
  options: RateLimitOptions
) {
  // Start cleanup interval on first middleware creation
  startCleanupInterval()

  return (req: Request, res: Response, next: NextFunction): Response | void => {
    try {
      const identifier = keyGenerator(req)
      const now = Date.now()

      // Get or create entry
      let entry = rateLimitStore.get(identifier)

      // Check if window has expired
      if (entry && now - entry.firstAttemptAt > options.windowMs) {
        rateLimitStore.delete(identifier)
        entry = undefined
      }

      const current = entry || {
        attempts: 0,
        firstAttemptAt: now,
        lastAttemptAt: now,
      }

      // Wrap response.json to track attempts
      const originalJson = res.json.bind(res)
      const countMode = options.countMode || 'failures'

      res.json = function (data: unknown) {
        const statusCode = res.statusCode

        // Determine if we should count this request
        let shouldCount = false
        if (countMode === 'all') {
          // Count all requests
          shouldCount = true
        } else if (countMode === 'failures') {
          // Count only error responses (>= 400)
          shouldCount = statusCode >= 400
        }

        if (shouldCount) {
          current.attempts++
          current.lastAttemptAt = now
          rateLimitStore.set(identifier, current)

          log.debug('rate_limit.attempt', {
            identifier: options.prefix ? `${options.prefix}:***` : '***',
            attempts: current.attempts,
            maxAttempts: options.maxAttempts,
          })

          // Check if we've now exceeded the limit AFTER incrementing
          if (current.attempts >= options.maxAttempts) {
            log.warn('rate_limit.exceeded', {
              identifier: options.prefix ? `${options.prefix}:***` : '***',
              attempts: current.attempts,
              maxAttempts: options.maxAttempts,
            })
            // Return 429 instead of the original response
            res.status(429)
            return originalJson({
              code: 'RATE_LIMITED',
              message: 'Too many attempts. Try again later.',
            })
          }
        } else if (countMode === 'failures') {
          // Clear counter on success (only in 'failures' mode)
          rateLimitStore.delete(identifier)
        }

        return originalJson(data)
      }

      next()
    } catch (err) {
      // Don't let rate limiting break the request
      log.error('rate_limit.error', { error: err instanceof Error ? err.message : String(err) })
      next()
    }
  }
}
