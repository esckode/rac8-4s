import type { RetryConfig } from '@worker/job-queue'
import { DEFAULT_RETRY_CONFIG } from '@worker/job-queue'

/**
 * Authentication configuration for tokens and magic links.
 */
export interface AuthConfig {
  /**
   * Time-to-live for magic link tokens in seconds.
   * Magic links are single-use tokens sent to player emails for registration/login.
   * Default: 86400 (24 hours)
   *
   * Usage: How long a player has to click the magic link email before it expires.
   * - Development: Consider shorter TTL (3600 = 1 hour) for faster testing
   * - Production: 86400 (24 hours) is reasonable for most use cases
   * - Security: Shorter = more secure, longer = more user-friendly
   */
  magicLinkTtlSeconds: number

  /**
   * Time-to-live for player session tokens in seconds.
   * Session tokens are issued after successfully verifying a magic link.
   * Default: 86400 (24 hours)
   *
   * Usage: How long a player's session remains valid before requiring re-login.
   * - Development: Use 86400 or longer to avoid frequent re-authentication
   * - Production: 86400 (24 hours) balances security and convenience
   * - Note: Organizer tokens have separate configuration via jwtConfig
   */
  sessionTtlSeconds: number

  /**
   * Time-to-live for JWT token blocklist entries in seconds.
   * When a player logs out, their token is added to a blocklist to prevent reuse.
   * Default: 3600 (1 hour)
   *
   * Usage: How long to keep revoked tokens in the blocklist.
   * - Must be >= sessionTtlSeconds to catch all possible token uses
   * - Typical value: Same as sessionTtlSeconds, or sessionTtlSeconds + buffer
   * - Example: If sessionTtlSeconds=86400, use tokenBlocklistTtlSeconds=86400
   * - Reduces memory usage by auto-expiring entries after TTL
   */
  tokenBlocklistTtlSeconds: number
}

/**
 * Data access limits and pagination settings.
 */
export interface LimitsConfig {
  /**
   * Maximum number of email recipients per job.
   * Limits batch processing to prevent memory/resource overload.
   * Default: 1000
   *
   * Usage: When sending emails to tournament participants.
   * - Controls chunk size for email job processing
   * - Higher = fewer jobs but more memory per job
   * - Lower = more jobs but lighter memory footprint
   * - Consider email provider rate limits:
   *   - SendGrid: ~100-1000 per batch typical
   *   - AWS SES: ~50-100 per batch for list-send
   * - Adjust based on your infrastructure capacity
   */
  emailRecipientsPerJob: number

  /**
   * Maximum number of players returned in a single query.
   * Limits database result set size for list operations.
   * Default: 10000
   *
   * Usage: Pagination limit when fetching player lists.
   * - Applied to: player registrations, tournament participants, etc.
   * - Higher = fewer queries but more memory
   * - Lower = safer memory footprint but more queries
   * - Typical values: 100-10000 depending on schema size
   * - Tune based on: RAM available, query complexity, UI pagination needs
   */
  playerQueryLimit: number

  /**
   * Maximum concurrent SSE connections per user.
   * Prevents resource exhaustion from a single user opening too many connections.
   * Default: 5
   *
   * Usage: Rate limit on SSE /tournaments/:id/events endpoint.
   * - Each connection reserves memory and file descriptor
   * - Higher = allows more simultaneous tabs but uses more resources
   * - Lower = prevents resource abuse but limits multi-tab experience
   * - Typical value: 5-10 per user
   */
  sseMaxConnectionsPerUser: number

  /**
   * Default pagination limits for different list endpoints.
   */
  paginationDefaults: {
    /** Default limit for tournament list endpoints */
    tournaments: number
    /** Default limit for match list endpoints */
    matches: number
    /** Default limit for player/registration list endpoints */
    players: number
  }

  /**
   * Email job audit and warning thresholds.
   * Used to trigger logging and monitoring alerts.
   */
  emailAuditThresholds: {
    /** Log audit entry when job exceeds this recipient count */
    auditLogThreshold: number
    /** Log warning when job exceeds this recipient count */
    warningLogThreshold: number
    /** Log warning when recipients exceed this percentage of max limit */
    warningPercentOfLimit: number
  }
}

/**
 * Database connection and query configuration.
 */
export interface DatabaseConfig {
  /**
   * Maximum time to wait for a query to complete, in milliseconds.
   * Default: 30000 (30 seconds)
   *
   * Usage: Prevents slow queries from blocking indefinitely.
   * - Applied to all repository queries
   * - If exceeded, query is cancelled and error returned
   * - Lower = fail fast (good for responsive APIs, bad for slow operations)
   * - Higher = allow slow operations (good for batch jobs, bad for user-facing endpoints)
   */
  queryTimeoutMs: number

  /**
   * Maximum attempts to retry a failed database operation.
   * Default: 3
   *
   * Usage: Retry transient failures like deadlocks and connection timeouts.
   * - Applied to transaction-based operations (createGroups, setSeeds)
   * - After max attempts exhausted, error is returned to caller
   * - Only retries on specific error codes (deadlock, timeout)
   */
  retryMaxAttempts: number

  /**
   * Base delay in milliseconds for exponential backoff between retries.
   * Default: 1000 (1 second)
   *
   * Usage: How long to wait between retry attempts.
   * - Retry delay = backoffBase * (2 ^ attempt)
   * - Attempt 1: 1000 * 2^1 = 2000ms
   * - Attempt 2: 1000 * 2^2 = 4000ms
   * - Attempt 3: 1000 * 2^3 = 8000ms
   */
  retryBackoffBaseMs: number

  /**
   * Maximum time to wait when acquiring a connection from the pool, in milliseconds.
   * Default: 5000 (5 seconds)
   *
   * Usage: Prevents requests from waiting indefinitely for an available connection.
   * - If pool is exhausted and no connections available after this timeout, error returned
   * - Lower = fail fast (good for detecting pool exhaustion early)
   * - Higher = wait longer (good for high-concurrency scenarios with temporary spikes)
   */
  connectionTimeoutMs: number
}

/**
 * Job queue and async processing configuration.
 */
export interface JobsConfig extends RetryConfig {
  /**
   * Maximum number of retry attempts for failed jobs.
   * After max attempts, job is moved to dead-letter queue.
   * Default: 3
   *
   * Usage: How many times to retry transient failures.
   * - Examples of transient failures: network timeout, database lock, SMTP unavailable
   * - Each retry waits with exponential backoff: 2^attempt * backoffBase
   * - Attempt 1: 2^1 * 1000ms = 2s
   * - Attempt 2: 2^2 * 1000ms = 4s
   * - Attempt 3: 2^3 * 1000ms = 8s
   * - Higher = more resilient but slower failure path
   * - Lower = faster failure detection but less resilience
   */
  maxAttempts: number

  /**
   * Base delay in milliseconds for exponential backoff.
   * Combined with maxAttempts to calculate retry delay: 2^attempt * backoffBase
   * Default: 1000 (1 second)
   *
   * Usage: How fast to retry failed jobs.
   * - backoffBase=1000: retries at 2s, 4s, 8s delays
   * - backoffBase=500: retries at 1s, 2s, 4s delays
   * - backoffBase=2000: retries at 4s, 8s, 16s delays
   * - Lower = aggressive retries (good for local dev, unreliable networks)
   * - Higher = conservative retries (good for slow systems, avoiding overload)
   * - Exponential prevents thundering herd: 1st retry is quick, later ones back off
   */
  backoffBase: number
}

/**
 * Complete application configuration.
 * All magic numbers and environment-dependent settings are centralized here.
 */
export interface AppConfig {
  auth: AuthConfig
  database: DatabaseConfig
  limits: LimitsConfig
  jobs: JobsConfig
}

/**
 * Default configuration values.
 * Suitable for local development and typical production deployments.
 * Override values via environment variables or direct instantiation.
 *
 * Example - override via environment:
 *   process.env.AUTH_MAGIC_LINK_TTL_SECONDS=3600
 *   const config = getAppConfig() // reads env overrides
 *
 * Example - override in code:
 *   const config = { ...DEFAULT_APP_CONFIG, auth: { ...DEFAULT_APP_CONFIG.auth, magicLinkTtlSeconds: 3600 } }
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  auth: {
    magicLinkTtlSeconds: 86400, // 24 hours - allow plenty of time to click email link
    sessionTtlSeconds: 86400, // 24 hours - balance convenience and security
    tokenBlocklistTtlSeconds: 86400, // Match sessionTtlSeconds to catch all revoked tokens
  },
  database: {
    queryTimeoutMs: 30000, // 30 seconds - reasonable for most queries
    retryMaxAttempts: 3, // Retry up to 3 times for transient failures
    retryBackoffBaseMs: 1000, // 1 second base for exponential backoff
    connectionTimeoutMs: 5000, // 5 seconds - timeout acquiring connection from pool
  },
  limits: {
    emailRecipientsPerJob: 1000, // Reasonable batch size for email providers
    playerQueryLimit: 10000, // Should handle most tournaments without pagination
    sseMaxConnectionsPerUser: 5, // Prevent resource exhaustion from one user
    paginationDefaults: {
      tournaments: 20, // Default limit for tournament listings
      matches: 20, // Default limit for match listings
      players: 50, // Default limit for player/registration listings
    },
    emailAuditThresholds: {
      auditLogThreshold: 500, // Log when ≥500 recipients (significant batch)
      warningLogThreshold: 100, // Log warning when ≥100 recipients (large batch)
      warningPercentOfLimit: 80, // Log warning at 80% of max recipients limit
    },
  },
  jobs: {
    maxAttempts: 3, // Try 3 times before giving up
    backoffBase: 1000, // 1000ms base = 2s, 4s, 8s delays
  },
}

/**
 * Load configuration from environment variables with fallback to defaults.
 * Environment variable naming convention: `APP_<SECTION>_<KEY>` in UPPER_SNAKE_CASE
 *
 * Examples:
 *   APP_AUTH_MAGIC_LINK_TTL_SECONDS=3600
 *   APP_DATABASE_QUERY_TIMEOUT_MS=30000
 *   APP_DATABASE_RETRY_MAX_ATTEMPTS=3
 *   APP_DATABASE_CONNECTION_TIMEOUT_MS=5000
 *   APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB=500
 *   APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER=10
 *   APP_LIMITS_PAGINATION_TOURNAMENTS=20
 *   APP_JOBS_MAX_ATTEMPTS=5
 *   APP_JOBS_BACKOFF_BASE=2000
 */
export function getAppConfig(): AppConfig {
  return {
    auth: {
      magicLinkTtlSeconds: parseInt(
        process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS ?? String(DEFAULT_APP_CONFIG.auth.magicLinkTtlSeconds),
        10
      ),
      sessionTtlSeconds: parseInt(
        process.env.APP_AUTH_SESSION_TTL_SECONDS ?? String(DEFAULT_APP_CONFIG.auth.sessionTtlSeconds),
        10
      ),
      tokenBlocklistTtlSeconds: parseInt(
        process.env.APP_AUTH_TOKEN_BLOCKLIST_TTL_SECONDS ??
          String(DEFAULT_APP_CONFIG.auth.tokenBlocklistTtlSeconds),
        10
      ),
    },
    database: {
      queryTimeoutMs: parseInt(
        process.env.APP_DATABASE_QUERY_TIMEOUT_MS ?? String(DEFAULT_APP_CONFIG.database.queryTimeoutMs),
        10
      ),
      retryMaxAttempts: parseInt(
        process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS ?? String(DEFAULT_APP_CONFIG.database.retryMaxAttempts),
        10
      ),
      retryBackoffBaseMs: parseInt(
        process.env.APP_DATABASE_RETRY_BACKOFF_BASE_MS ?? String(DEFAULT_APP_CONFIG.database.retryBackoffBaseMs),
        10
      ),
      connectionTimeoutMs: parseInt(
        process.env.APP_DATABASE_CONNECTION_TIMEOUT_MS ?? String(DEFAULT_APP_CONFIG.database.connectionTimeoutMs),
        10
      ),
    },
    limits: {
      emailRecipientsPerJob: parseInt(
        process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB ?? String(DEFAULT_APP_CONFIG.limits.emailRecipientsPerJob),
        10
      ),
      playerQueryLimit: parseInt(
        process.env.APP_LIMITS_PLAYER_QUERY_LIMIT ?? String(DEFAULT_APP_CONFIG.limits.playerQueryLimit),
        10
      ),
      sseMaxConnectionsPerUser: parseInt(
        process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER ??
          String(DEFAULT_APP_CONFIG.limits.sseMaxConnectionsPerUser),
        10
      ),
      paginationDefaults: {
        tournaments: parseInt(
          process.env.APP_LIMITS_PAGINATION_TOURNAMENTS ??
            String(DEFAULT_APP_CONFIG.limits.paginationDefaults.tournaments),
          10
        ),
        matches: parseInt(
          process.env.APP_LIMITS_PAGINATION_MATCHES ??
            String(DEFAULT_APP_CONFIG.limits.paginationDefaults.matches),
          10
        ),
        players: parseInt(
          process.env.APP_LIMITS_PAGINATION_PLAYERS ??
            String(DEFAULT_APP_CONFIG.limits.paginationDefaults.players),
          10
        ),
      },
      emailAuditThresholds: {
        auditLogThreshold: parseInt(
          process.env.APP_LIMITS_EMAIL_AUDIT_THRESHOLD ??
            String(DEFAULT_APP_CONFIG.limits.emailAuditThresholds.auditLogThreshold),
          10
        ),
        warningLogThreshold: parseInt(
          process.env.APP_LIMITS_EMAIL_WARNING_THRESHOLD ??
            String(DEFAULT_APP_CONFIG.limits.emailAuditThresholds.warningLogThreshold),
          10
        ),
        warningPercentOfLimit: parseInt(
          process.env.APP_LIMITS_EMAIL_WARNING_PERCENT ??
            String(DEFAULT_APP_CONFIG.limits.emailAuditThresholds.warningPercentOfLimit),
          10
        ),
      },
    },
    jobs: {
      maxAttempts: parseInt(
        process.env.APP_JOBS_MAX_ATTEMPTS ?? String(DEFAULT_APP_CONFIG.jobs.maxAttempts),
        10
      ),
      backoffBase: parseInt(process.env.APP_JOBS_BACKOFF_BASE ?? String(DEFAULT_APP_CONFIG.jobs.backoffBase), 10),
    },
  }
}
