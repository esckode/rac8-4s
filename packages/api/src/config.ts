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
 * Rate limiting configuration for auth endpoints.
 */
export interface RateLimitConfig {
  /**
   * Maximum failed login attempts before rate limiting.
   * Tracks by email + IP address to prevent distributed attacks.
   * Default: 5
   *
   * Usage: Login endpoint rate limiting.
   * - After this many failed attempts, subsequent requests return 429
   * - Counter resets on successful login or after time window expires
   * - Recommended value: 5 (allows a few typos before blocking)
   */
  loginMaxAttempts: number

  /**
   * Time window for login rate limiting in milliseconds.
   * Default: 900000 (15 minutes)
   *
   * Usage: How long to track failed login attempts.
   * - Failed attempts within this window count toward the limit
   * - Counter resets after window expires
   * - Recommended value: 15 minutes (standard for password flows)
   */
  loginWindowMs: number

  /**
   * Maximum forgot-password requests before rate limiting.
   * Tracks by email to prevent email enumeration attacks.
   * Default: 5
   *
   * Usage: Forgot-password endpoint rate limiting.
   * - After this many requests, subsequent requests return 429
   * - Counter resets after time window expires
   * - Recommended value: 5 (prevents abuse without being too restrictive)
   */
  forgotPasswordMaxAttempts: number

  /**
   * Time window for forgot-password rate limiting in milliseconds.
   * Default: 900000 (15 minutes)
   *
   * Usage: How long to track forgot-password requests.
   * - Requests within this window count toward the limit
   * - Counter resets after window expires
   * - Recommended value: 15 minutes (standard for password flows)
   */
  forgotPasswordWindowMs: number

  /**
   * Maximum public tournament-registration requests per email before rate
   * limiting. This is the sharp anti-bombing defense (ISSUE-11) — a legit
   * user registers a given address ~once. Default: 3.
   */
  registerPerEmailMaxAttempts: number

  /**
   * Time window for per-email registration rate limiting in milliseconds.
   * Default: 900000 (15 minutes)
   */
  registerPerEmailWindowMs: number

  /**
   * Maximum public tournament-registration requests per IP before rate
   * limiting. Kept generous (ISSUE-11): a venue's shared Wi-Fi is one NAT'd
   * IP, and a captain may register several people from one phone — this
   * only caps a runaway cannon, the per-email limit does the precise work.
   * Default: 25.
   */
  registerPerIpMaxAttempts: number

  /**
   * Time window for per-IP registration rate limiting in milliseconds.
   * Default: 900000 (15 minutes)
   */
  registerPerIpWindowMs: number

  /**
   * Maximum doubles partner-invite emails sent to the same partner address
   * before rate limiting (ISSUE-15 sub-decision 2). The partner is a third
   * party, not the requester — without a limiter keyed on their address, an
   * attacker could rotate requester emails and re-open the email-bombing
   * vector ISSUE-11 closed. Default: 3.
   */
  partnerInvitePerEmailMaxAttempts: number

  /**
   * Time window for per-partner-email invite rate limiting in milliseconds.
   * Default: 900000 (15 minutes)
   */
  partnerInvitePerEmailWindowMs: number
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
   * Rate limiting configuration for auth endpoints.
   */
  rateLimit: RateLimitConfig

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
 * Messaging retention and partition management configuration.
 */
export interface MessagingConfig {
  /**
   * Days to retain messages after a tournament's completed_at timestamp.
   * Partitions whose tournament(s) all cleared this window are eligible for DROP.
   * Default: 90 (3 months)
   *
   * Usage: Controls how long post-tournament messages are kept queryable.
   * - Higher = more storage, longer message history
   * - Lower = less storage, shorter retention window
   * - Override via APP_MESSAGING_RETENTION_DAYS env var
   */
  retentionDays: number

  /**
   * Extra padding days before a partition is physically dropped.
   * A partition is only considered for DROP when it is older than
   * (retentionDays + dropPaddingDays) days. This buffer lets late-arriving
   * rows settle and avoids racing the retention boundary.
   * Default: 45
   *
   * Usage: Safety margin on top of retentionDays.
   * - Must be > 0; typical values: 30–60 days
   * - Override via APP_MESSAGING_DROP_PADDING_DAYS env var
   */
  dropPaddingDays: number

  /**
   * Number of future months (beyond current month) to pre-create partitions for.
   * ensure_future_partitions creates current + monthsAhead partitions.
   * Default: 2
   *
   * Usage: Ensures writes never fall into a missing partition.
   * - Run ensure_future_partitions on a schedule (e.g. monthly cron).
   * - Higher = more pre-created partitions; 2 is safe for monthly scheduling.
   * - Override via APP_MESSAGING_MONTHS_AHEAD env var
   */
  monthsAhead: number
}

/**
 * Email service configuration.
 */
export interface EmailConfig {
  /**
   * Email address to send from.
   * Default: "noreply@rac8-4s.local"
   *
   * Usage: Sender address for password reset and other transactional emails.
   * - Should be a valid, non-monitored address
   * - Override via EMAIL_FROM_ADDRESS env var
   */
  fromAddress: string

  /**
   * Frontend base URL for generating reset links.
   * Default: "http://localhost:3000"
   *
   * Usage: Used in password reset emails to create clickable links.
   * - Must include protocol (http:// or https://)
   * - No trailing slash
   * - Override via FRONTEND_URL env var
   */
  frontendUrl: string

  /**
   * Email service type for sending emails.
   * Default: "mock" (logs to console instead of sending)
   *
   * Usage: Choose which email service to use for sending emails.
   * - "mock": Development/testing mode - logs emails to console
   * - "sendgrid": Production - sends via SendGrid API (requires SENDGRID_API_KEY env var)
   * - "aws_ses": Production - sends via AWS SES (credentials from the SDK's
   *   default credential chain, e.g. an EC2 instance role — no static keys)
   * - Override via EMAIL_SERVICE env var
   */
  service: 'mock' | 'sendgrid' | 'aws_ses'
}

/**
 * LLM assistant (@coach) configuration.
 */
export interface AssistantConfig {
  /**
   * Assistant client adapter.
   * Default: "mock" (deterministic keyword router — no network, used in dev/tests/e2e)
   *
   * Usage: Choose which AssistantClient implementation runs LLM turns.
   * - "mock": deterministic keyword router; fakes only the NL→intent hop, tools are real
   * - "anthropic-aws": Claude Platform on AWS via @anthropic-ai/aws-sdk (primary channel);
   *   requires AWS_REGION and ANTHROPIC_AWS_WORKSPACE_ID env vars (SigV4 via AWS cred chain)
   * - "anthropic": first-party Claude API fallback; requires ANTHROPIC_API_KEY env var
   * - Override via ASSISTANT_ADAPTER env var
   */
  adapter: 'mock' | 'anthropic-aws' | 'anthropic'

  /**
   * Model ID for assistant turns.
   * Default: "claude-haiku-4-5"
   * Override via ASSISTANT_MODEL env var (model upgrade = config change, no code change).
   */
  model: string

  /**
   * Global daily spend kill-switch in USD.
   * Default: 5
   * When estimated cumulative spend for the current UTC day exceeds this, the assistant
   * stops answering until the window resets.
   * Override via ASSISTANT_DAILY_BUDGET_USD env var.
   */
  dailyBudgetUsd: number

  /**
   * Model ID for 1:1 Coach turns (private per-player conversation).
   * Default: "claude-haiku-4-5"
   * Kept separate from `model` (the group-surface model) per COACH_1TO1_DESIGN.md §7 #3 —
   * pre-agreed upgrade trigger is a config flip to Sonnet, no re-grill.
   * Override via COACH_MODEL env var.
   */
  coachModel: string
}

/**
 * Redis and distributed-backend configuration.
 */
export interface RedisConfig {
  /**
   * Redis connection URL.
   * Default: undefined (no Redis; in-memory backends are used)
   * Override via REDIS_URL env var.
   */
  url: string | undefined

  /**
   * Job queue backend.
   * Default: 'memory' (in-process InMemoryJobQueue — no Redis required)
   * 'bullmq' requires REDIS_URL and uses BullMQ (V1.3).
   * Override via JOB_QUEUE env var.
   */
  jobQueue: 'memory' | 'bullmq'

  /**
   * SSE broadcast bus backend.
   * Default: 'memory' (in-process BroadcastBus — no Redis required)
   * 'redis' requires REDIS_URL and uses RedisBroadcastBus (V1.2).
   * Override via SSE_BUS env var.
   */
  sseBus: 'memory' | 'redis'

  /**
   * Token store backend.
   * Default: 'memory' (InMemoryTokenStore — no Redis required)
   * 'redis' requires REDIS_URL and uses RedisTokenStore (V1.4).
   * Override via TOKEN_STORE env var.
   */
  tokenStore: 'memory' | 'redis'

  /**
   * Rate-limit counter store backend.
   * Default: 'memory' (InMemoryCounterStore — no Redis required; single-instance only)
   * 'redis' requires REDIS_URL and uses RedisCounterStore (V2.3): atomic, shared across
   * instances — prevents limit bypass via round-robin LB (R-17.10.2).
   * Override via RATE_LIMIT_STORE env var.
   */
  rateLimitStore: 'memory' | 'redis'
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
  email: EmailConfig
  messaging: MessagingConfig
  redis: RedisConfig
  assistant: AssistantConfig
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
    rateLimit: {
      loginMaxAttempts: 5, // Max 5 failed login attempts
      loginWindowMs: 15 * 60 * 1000, // 15 minutes
      forgotPasswordMaxAttempts: 5, // Max 5 forgot-password requests
      forgotPasswordWindowMs: 15 * 60 * 1000, // 15 minutes
      registerPerEmailMaxAttempts: 3, // Sharp anti-bombing defense — a legit user registers ~once
      registerPerEmailWindowMs: 15 * 60 * 1000, // 15 minutes
      registerPerIpMaxAttempts: 25, // Generous — venue shared Wi-Fi, one phone registering several people
      registerPerIpWindowMs: 15 * 60 * 1000, // 15 minutes
      partnerInvitePerEmailMaxAttempts: 3, // Sharp anti-bombing defense, mirrors registerPerEmail
      partnerInvitePerEmailWindowMs: 15 * 60 * 1000, // 15 minutes
    },
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
  email: {
    fromAddress: 'noreply@rac8-4s.local', // Sender address for transactional emails
    frontendUrl: 'http://localhost:3000', // Frontend base URL for reset links
    service: 'mock', // Use mock service by default (development)
  },
  messaging: {
    retentionDays: 90,   // Keep messages 90 days post-tournament completion
    dropPaddingDays: 45, // Extra 45-day safety buffer before physical drop
    monthsAhead: 2,      // Pre-create partitions 2 months ahead of current month
  },
  redis: {
    url: undefined,            // No Redis by default; in-memory backends are used
    jobQueue: 'memory',        // Use in-process queue by default (no Redis needed)
    sseBus: 'memory',          // Use in-process bus by default (no Redis needed)
    tokenStore: 'memory',      // Use in-memory token store by default (no Redis needed)
    rateLimitStore: 'memory',  // Use in-memory counter by default (no Redis needed)
  },
  assistant: {
    adapter: 'mock',           // No network by default; real channel is opt-in via env
    model: 'claude-haiku-4-5', // Cheapest capable model (design Q8)
    dailyBudgetUsd: 5,         // Global daily spend kill-switch (design Q10)
    coachModel: 'claude-haiku-4-5', // 1:1 Coach model (COACH_1TO1_DESIGN.md §7 #3)
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
 *   APP_LIMITS_RATE_LIMIT_LOGIN_MAX_ATTEMPTS=5
 *   APP_LIMITS_RATE_LIMIT_LOGIN_WINDOW_MS=900000
 *   APP_LIMITS_RATE_LIMIT_FORGOT_PASSWORD_MAX_ATTEMPTS=5
 *   APP_LIMITS_RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS=900000
 *   APP_JOBS_MAX_ATTEMPTS=5
 *   APP_JOBS_BACKOFF_BASE=2000
 *   EMAIL_SERVICE=mock|sendgrid|aws_ses
 *   EMAIL_FROM_ADDRESS=noreply@example.com
 *   FRONTEND_URL=https://app.example.com
 *   SENDGRID_API_KEY=your-key (for EMAIL_SERVICE=sendgrid)
 *   AWS_REGION=us-east-1 (for EMAIL_SERVICE=aws_ses; credentials come from
 *     the SDK's default credential chain, e.g. an EC2 instance role)
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
      rateLimit: {
        loginMaxAttempts: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_LOGIN_MAX_ATTEMPTS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.loginMaxAttempts),
          10
        ),
        loginWindowMs: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_LOGIN_WINDOW_MS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.loginWindowMs),
          10
        ),
        forgotPasswordMaxAttempts: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_FORGOT_PASSWORD_MAX_ATTEMPTS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.forgotPasswordMaxAttempts),
          10
        ),
        forgotPasswordWindowMs: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.forgotPasswordWindowMs),
          10
        ),
        registerPerEmailMaxAttempts: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_REGISTER_PER_EMAIL_MAX_ATTEMPTS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.registerPerEmailMaxAttempts),
          10
        ),
        registerPerEmailWindowMs: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_REGISTER_PER_EMAIL_WINDOW_MS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.registerPerEmailWindowMs),
          10
        ),
        registerPerIpMaxAttempts: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_REGISTER_PER_IP_MAX_ATTEMPTS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.registerPerIpMaxAttempts),
          10
        ),
        registerPerIpWindowMs: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_REGISTER_PER_IP_WINDOW_MS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.registerPerIpWindowMs),
          10
        ),
        partnerInvitePerEmailMaxAttempts: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_PARTNER_INVITE_PER_EMAIL_MAX_ATTEMPTS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.partnerInvitePerEmailMaxAttempts),
          10
        ),
        partnerInvitePerEmailWindowMs: parseInt(
          process.env.APP_LIMITS_RATE_LIMIT_PARTNER_INVITE_PER_EMAIL_WINDOW_MS ??
            String(DEFAULT_APP_CONFIG.limits.rateLimit.partnerInvitePerEmailWindowMs),
          10
        ),
      },
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
    email: {
      fromAddress: process.env.EMAIL_FROM_ADDRESS ?? DEFAULT_APP_CONFIG.email.fromAddress,
      frontendUrl: process.env.FRONTEND_URL ?? DEFAULT_APP_CONFIG.email.frontendUrl,
      service: (process.env.EMAIL_SERVICE ?? DEFAULT_APP_CONFIG.email.service) as 'mock' | 'sendgrid' | 'aws_ses',
    },
    messaging: {
      retentionDays: parseInt(
        process.env.APP_MESSAGING_RETENTION_DAYS ?? String(DEFAULT_APP_CONFIG.messaging.retentionDays),
        10
      ),
      dropPaddingDays: parseInt(
        process.env.APP_MESSAGING_DROP_PADDING_DAYS ?? String(DEFAULT_APP_CONFIG.messaging.dropPaddingDays),
        10
      ),
      monthsAhead: parseInt(
        process.env.APP_MESSAGING_MONTHS_AHEAD ?? String(DEFAULT_APP_CONFIG.messaging.monthsAhead),
        10
      ),
    },
    redis: {
      url: process.env.REDIS_URL || undefined,
      jobQueue: (process.env.JOB_QUEUE ?? DEFAULT_APP_CONFIG.redis.jobQueue) as 'memory' | 'bullmq',
      sseBus: (process.env.SSE_BUS ?? DEFAULT_APP_CONFIG.redis.sseBus) as 'memory' | 'redis',
      tokenStore: (process.env.TOKEN_STORE ?? DEFAULT_APP_CONFIG.redis.tokenStore) as 'memory' | 'redis',
      rateLimitStore: (process.env.RATE_LIMIT_STORE ?? DEFAULT_APP_CONFIG.redis.rateLimitStore) as 'memory' | 'redis',
    },
    assistant: {
      adapter: (process.env.ASSISTANT_ADAPTER ?? DEFAULT_APP_CONFIG.assistant.adapter) as
        | 'mock'
        | 'anthropic-aws'
        | 'anthropic',
      model: process.env.ASSISTANT_MODEL ?? DEFAULT_APP_CONFIG.assistant.model,
      dailyBudgetUsd: parseFloat(
        process.env.ASSISTANT_DAILY_BUDGET_USD ?? String(DEFAULT_APP_CONFIG.assistant.dailyBudgetUsd)
      ),
      coachModel: process.env.COACH_MODEL ?? DEFAULT_APP_CONFIG.assistant.coachModel,
    },
  }
}
