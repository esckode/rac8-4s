import { Request, Response, NextFunction } from 'express'
import { getLogger } from '../logger'
import { InMemoryCounterStore, RateLimitCounterStore, selectRateLimitStore } from './rate-limit-store'

const log = getLogger('rate-limit')

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

// ─── Module-level counter store ───────────────────────────────────────────────
//
// Initialised lazily on first middleware use.  In tests (RATE_LIMIT_STORE unset)
// this is always InMemoryCounterStore; in production with RATE_LIMIT_STORE=redis
// it is RedisCounterStore.

let _store: RateLimitCounterStore | null = null

function getStore(): RateLimitCounterStore {
  if (!_store) {
    _store = selectRateLimitStore()
  }
  return _store
}

/**
 * Clear all rate limit counters (for tests).
 * Replaces the in-memory store with a fresh instance.
 * No-op in spirit for Redis (tests never enable Redis so they always get in-memory).
 */
export function clearRateLimitStore(): void {
  // Replace the store instance so all counters reset.
  _store = new InMemoryCounterStore()
}

/**
 * No-op kept for backward-compatibility with existing tests.
 * InMemoryCounterStore no longer uses a background cleanup interval.
 */
export function stopCleanupInterval(): void {
  // no-op
}

/**
 * Create a rate limit middleware.
 *
 * Tracks requests by a custom key and returns 429 when limit exceeded.
 * Counting mode (all requests vs only failures) is configurable via `countMode`.
 * On successful response in 'failures' mode, the counter is reset.
 *
 * The counter store (in-memory or Redis) is env-selected via RATE_LIMIT_STORE.
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
  const windowSeconds = Math.ceil(options.windowMs / 1000)
  const countMode = options.countMode ?? 'failures'

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const identifier = keyGenerator(req)
      const store = getStore()

      // Override res.json to intercept the final response and apply rate-limit logic.
      // We make the override async so we can await the counter store (needed for Redis).
      // Express ignores the return value of res.json — what matters is that the response
      // body is written (which we do via the originalJson / res.status + originalJson calls).
      const originalJson = res.json.bind(res)

      // Cast to any to allow replacing with an async function.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(res as any).json = async function (data: unknown): Promise<void> {
        const statusCode = res.statusCode

        let shouldCount = false
        if (countMode === 'all') {
          shouldCount = true
        } else if (countMode === 'failures') {
          shouldCount = statusCode >= 400
        }

        if (shouldCount) {
          try {
            const count = await store.increment(identifier, windowSeconds)

            log.debug('rate_limit.attempt', {
              identifier: options.prefix ? `${options.prefix}:***` : '***',
              attempts: count,
              maxAttempts: options.maxAttempts,
            })

            if (count >= options.maxAttempts) {
              log.warn('rate_limit.exceeded', {
                identifier: options.prefix ? `${options.prefix}:***` : '***',
                attempts: count,
                maxAttempts: options.maxAttempts,
              })
              res.status(429)
              originalJson({
                code: 'RATE_LIMITED',
                message: 'Too many attempts. Try again later.',
                retryAfterSeconds: windowSeconds,
              })
              return
            }
          } catch (err) {
            log.error('rate_limit.increment.error', { error: err instanceof Error ? err.message : String(err) })
            // Fall through — don't let rate-limit errors block the response
          }
        } else if (countMode === 'failures') {
          // Success in 'failures' mode — reset the counter
          store.reset(identifier).catch((err) => {
            log.error('rate_limit.reset.error', { error: err instanceof Error ? err.message : String(err) })
          })
        }

        originalJson(data)
      }

      next()
    } catch (err) {
      // Don't let rate limiting break the request
      log.error('rate_limit.error', { error: err instanceof Error ? err.message : String(err) })
      next()
    }
  }
}
