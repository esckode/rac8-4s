/**
 * Tests for config.ts - Configuration loading and validation
 *
 * Focus: Testing environment variable loading, default values, type coercion,
 * and validation of configuration for authentication, database, limits, and jobs.
 */

import { getAppConfig, DEFAULT_APP_CONFIG } from '../../config'

describe('config.ts', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Save original environment
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('DEFAULT_APP_CONFIG', () => {
    it('provides default configuration object with all required sections', () => {
      expect(DEFAULT_APP_CONFIG).toHaveProperty('auth')
      expect(DEFAULT_APP_CONFIG).toHaveProperty('database')
      expect(DEFAULT_APP_CONFIG).toHaveProperty('limits')
      expect(DEFAULT_APP_CONFIG).toHaveProperty('jobs')
    })

    it('defines sensible defaults for auth configuration', () => {
      const { auth } = DEFAULT_APP_CONFIG

      expect(auth.magicLinkTtlSeconds).toBe(86400) // 24 hours
      expect(auth.sessionTtlSeconds).toBe(86400) // 24 hours
      expect(auth.tokenBlocklistTtlSeconds).toBe(86400) // matches sessionTtlSeconds
    })

    it('defines sensible defaults for database configuration', () => {
      const { database } = DEFAULT_APP_CONFIG

      expect(database.queryTimeoutMs).toBe(30000) // 30 seconds
      expect(database.retryMaxAttempts).toBe(3)
      expect(database.retryBackoffBaseMs).toBe(1000) // 1 second
      expect(database.connectionTimeoutMs).toBe(5000) // 5 seconds
    })

    it('defines sensible defaults for limits configuration', () => {
      const { limits } = DEFAULT_APP_CONFIG

      expect(limits.emailRecipientsPerJob).toBe(1000)
      expect(limits.playerQueryLimit).toBe(10000)
      expect(limits.sseMaxConnectionsPerUser).toBe(5)

      expect(limits.paginationDefaults.tournaments).toBe(20)
      expect(limits.paginationDefaults.matches).toBe(20)
      expect(limits.paginationDefaults.players).toBe(50)

      expect(limits.emailAuditThresholds.auditLogThreshold).toBe(500)
      expect(limits.emailAuditThresholds.warningLogThreshold).toBe(100)
      expect(limits.emailAuditThresholds.warningPercentOfLimit).toBe(80)
    })

    it('defines sensible defaults for jobs configuration', () => {
      const { jobs } = DEFAULT_APP_CONFIG

      expect(jobs.maxAttempts).toBe(3)
      expect(jobs.backoffBase).toBe(1000)
    })
  })

  describe('getAppConfig() - Environment Variable Loading', () => {
    it('loads auth configuration from environment variables', () => {
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '3600'
      process.env.APP_AUTH_SESSION_TTL_SECONDS = '7200'
      process.env.APP_AUTH_TOKEN_BLOCKLIST_TTL_SECONDS = '10800'

      const config = getAppConfig()

      expect(config.auth.magicLinkTtlSeconds).toBe(3600)
      expect(config.auth.sessionTtlSeconds).toBe(7200)
      expect(config.auth.tokenBlocklistTtlSeconds).toBe(10800)
    })

    it('loads database configuration from environment variables', () => {
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '60000'
      process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS = '5'
      process.env.APP_DATABASE_RETRY_BACKOFF_BASE_MS = '2000'
      process.env.APP_DATABASE_CONNECTION_TIMEOUT_MS = '10000'

      const config = getAppConfig()

      expect(config.database.queryTimeoutMs).toBe(60000)
      expect(config.database.retryMaxAttempts).toBe(5)
      expect(config.database.retryBackoffBaseMs).toBe(2000)
      expect(config.database.connectionTimeoutMs).toBe(10000)
    })

    it('loads limits configuration from environment variables', () => {
      process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB = '500'
      process.env.APP_LIMITS_PLAYER_QUERY_LIMIT = '20000'
      process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER = '10'
      process.env.APP_LIMITS_PAGINATION_TOURNAMENTS = '50'
      process.env.APP_LIMITS_PAGINATION_MATCHES = '100'
      process.env.APP_LIMITS_PAGINATION_PLAYERS = '200'

      const config = getAppConfig()

      expect(config.limits.emailRecipientsPerJob).toBe(500)
      expect(config.limits.playerQueryLimit).toBe(20000)
      expect(config.limits.sseMaxConnectionsPerUser).toBe(10)
      expect(config.limits.paginationDefaults.tournaments).toBe(50)
      expect(config.limits.paginationDefaults.matches).toBe(100)
      expect(config.limits.paginationDefaults.players).toBe(200)
    })

    it('loads email audit thresholds from environment variables', () => {
      process.env.APP_LIMITS_EMAIL_AUDIT_THRESHOLD = '1000'
      process.env.APP_LIMITS_EMAIL_WARNING_THRESHOLD = '500'
      process.env.APP_LIMITS_EMAIL_WARNING_PERCENT = '90'

      const config = getAppConfig()

      expect(config.limits.emailAuditThresholds.auditLogThreshold).toBe(1000)
      expect(config.limits.emailAuditThresholds.warningLogThreshold).toBe(500)
      expect(config.limits.emailAuditThresholds.warningPercentOfLimit).toBe(90)
    })

    it('loads jobs configuration from environment variables', () => {
      process.env.APP_JOBS_MAX_ATTEMPTS = '5'
      process.env.APP_JOBS_BACKOFF_BASE = '2000'

      const config = getAppConfig()

      expect(config.jobs.maxAttempts).toBe(5)
      expect(config.jobs.backoffBase).toBe(2000)
    })
  })

  describe('getAppConfig() - Default Fallback', () => {
    it('uses default auth values when environment variables are not set', () => {
      delete process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS
      delete process.env.APP_AUTH_SESSION_TTL_SECONDS
      delete process.env.APP_AUTH_TOKEN_BLOCKLIST_TTL_SECONDS

      const config = getAppConfig()

      expect(config.auth.magicLinkTtlSeconds).toBe(DEFAULT_APP_CONFIG.auth.magicLinkTtlSeconds)
      expect(config.auth.sessionTtlSeconds).toBe(DEFAULT_APP_CONFIG.auth.sessionTtlSeconds)
      expect(config.auth.tokenBlocklistTtlSeconds).toBe(DEFAULT_APP_CONFIG.auth.tokenBlocklistTtlSeconds)
    })

    it('uses default database values when environment variables are not set', () => {
      delete process.env.APP_DATABASE_QUERY_TIMEOUT_MS
      delete process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS
      delete process.env.APP_DATABASE_RETRY_BACKOFF_BASE_MS
      delete process.env.APP_DATABASE_CONNECTION_TIMEOUT_MS

      const config = getAppConfig()

      expect(config.database.queryTimeoutMs).toBe(DEFAULT_APP_CONFIG.database.queryTimeoutMs)
      expect(config.database.retryMaxAttempts).toBe(DEFAULT_APP_CONFIG.database.retryMaxAttempts)
      expect(config.database.retryBackoffBaseMs).toBe(DEFAULT_APP_CONFIG.database.retryBackoffBaseMs)
      expect(config.database.connectionTimeoutMs).toBe(DEFAULT_APP_CONFIG.database.connectionTimeoutMs)
    })

    it('uses default limits values when environment variables are not set', () => {
      delete process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB
      delete process.env.APP_LIMITS_PLAYER_QUERY_LIMIT
      delete process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER
      delete process.env.APP_LIMITS_PAGINATION_TOURNAMENTS
      delete process.env.APP_LIMITS_PAGINATION_MATCHES
      delete process.env.APP_LIMITS_PAGINATION_PLAYERS
      delete process.env.APP_LIMITS_EMAIL_AUDIT_THRESHOLD
      delete process.env.APP_LIMITS_EMAIL_WARNING_THRESHOLD
      delete process.env.APP_LIMITS_EMAIL_WARNING_PERCENT

      const config = getAppConfig()

      expect(config.limits.emailRecipientsPerJob).toBe(DEFAULT_APP_CONFIG.limits.emailRecipientsPerJob)
      expect(config.limits.playerQueryLimit).toBe(DEFAULT_APP_CONFIG.limits.playerQueryLimit)
      expect(config.limits.sseMaxConnectionsPerUser).toBe(DEFAULT_APP_CONFIG.limits.sseMaxConnectionsPerUser)
      expect(config.limits.paginationDefaults.tournaments).toBe(
        DEFAULT_APP_CONFIG.limits.paginationDefaults.tournaments
      )
      expect(config.limits.paginationDefaults.matches).toBe(DEFAULT_APP_CONFIG.limits.paginationDefaults.matches)
      expect(config.limits.paginationDefaults.players).toBe(DEFAULT_APP_CONFIG.limits.paginationDefaults.players)
      expect(config.limits.emailAuditThresholds.auditLogThreshold).toBe(
        DEFAULT_APP_CONFIG.limits.emailAuditThresholds.auditLogThreshold
      )
      expect(config.limits.emailAuditThresholds.warningLogThreshold).toBe(
        DEFAULT_APP_CONFIG.limits.emailAuditThresholds.warningLogThreshold
      )
      expect(config.limits.emailAuditThresholds.warningPercentOfLimit).toBe(
        DEFAULT_APP_CONFIG.limits.emailAuditThresholds.warningPercentOfLimit
      )
    })

    it('uses default jobs values when environment variables are not set', () => {
      delete process.env.APP_JOBS_MAX_ATTEMPTS
      delete process.env.APP_JOBS_BACKOFF_BASE

      const config = getAppConfig()

      expect(config.jobs.maxAttempts).toBe(DEFAULT_APP_CONFIG.jobs.maxAttempts)
      expect(config.jobs.backoffBase).toBe(DEFAULT_APP_CONFIG.jobs.backoffBase)
    })
  })

  describe('getAppConfig() - Type Coercion', () => {
    it('coerces string environment values to numbers', () => {
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '1234'
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '45000'
      process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB = '2000'
      process.env.APP_JOBS_MAX_ATTEMPTS = '4'

      const config = getAppConfig()

      expect(typeof config.auth.magicLinkTtlSeconds).toBe('number')
      expect(typeof config.database.queryTimeoutMs).toBe('number')
      expect(typeof config.limits.emailRecipientsPerJob).toBe('number')
      expect(typeof config.jobs.maxAttempts).toBe('number')

      expect(config.auth.magicLinkTtlSeconds).toBe(1234)
      expect(config.database.queryTimeoutMs).toBe(45000)
      expect(config.limits.emailRecipientsPerJob).toBe(2000)
      expect(config.jobs.maxAttempts).toBe(4)
    })

    it('parses integer strings with base 10', () => {
      process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS = '007'
      process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER = '09'

      const config = getAppConfig()

      // Should parse as decimal, not octal
      expect(config.database.retryMaxAttempts).toBe(7)
      expect(config.limits.sseMaxConnectionsPerUser).toBe(9)
    })

    it('handles large numeric values', () => {
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '999999'
      process.env.APP_LIMITS_PLAYER_QUERY_LIMIT = '1000000'

      const config = getAppConfig()

      expect(config.database.queryTimeoutMs).toBe(999999)
      expect(config.limits.playerQueryLimit).toBe(1000000)
    })

    it('handles zero values', () => {
      process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS = '0'
      process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER = '0'

      const config = getAppConfig()

      expect(config.database.retryMaxAttempts).toBe(0)
      expect(config.limits.sseMaxConnectionsPerUser).toBe(0)
    })
  })

  describe('getAppConfig() - Partial Environment Configuration', () => {
    it('allows mixed environment and default values', () => {
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '1800'
      // Leave APP_AUTH_SESSION_TTL_SECONDS unset - should use default
      process.env.APP_AUTH_TOKEN_BLOCKLIST_TTL_SECONDS = '9000'

      const config = getAppConfig()

      expect(config.auth.magicLinkTtlSeconds).toBe(1800)
      expect(config.auth.sessionTtlSeconds).toBe(DEFAULT_APP_CONFIG.auth.sessionTtlSeconds)
      expect(config.auth.tokenBlocklistTtlSeconds).toBe(9000)
    })

    it('allows overriding only some database configuration', () => {
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '20000'
      // Leave others unset - should use defaults
      delete process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS
      delete process.env.APP_DATABASE_RETRY_BACKOFF_BASE_MS
      delete process.env.APP_DATABASE_CONNECTION_TIMEOUT_MS

      const config = getAppConfig()

      expect(config.database.queryTimeoutMs).toBe(20000)
      expect(config.database.retryMaxAttempts).toBe(DEFAULT_APP_CONFIG.database.retryMaxAttempts)
      expect(config.database.retryBackoffBaseMs).toBe(DEFAULT_APP_CONFIG.database.retryBackoffBaseMs)
      expect(config.database.connectionTimeoutMs).toBe(DEFAULT_APP_CONFIG.database.connectionTimeoutMs)
    })

    it('allows overriding only some pagination defaults', () => {
      process.env.APP_LIMITS_PAGINATION_TOURNAMENTS = '100'
      delete process.env.APP_LIMITS_PAGINATION_MATCHES
      delete process.env.APP_LIMITS_PAGINATION_PLAYERS

      const config = getAppConfig()

      expect(config.limits.paginationDefaults.tournaments).toBe(100)
      expect(config.limits.paginationDefaults.matches).toBe(DEFAULT_APP_CONFIG.limits.paginationDefaults.matches)
      expect(config.limits.paginationDefaults.players).toBe(DEFAULT_APP_CONFIG.limits.paginationDefaults.players)
    })
  })

  describe('getAppConfig() - Complete Override', () => {
    it('produces fully customized configuration when all env vars are set', () => {
      // Auth
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '7200'
      process.env.APP_AUTH_SESSION_TTL_SECONDS = '14400'
      process.env.APP_AUTH_TOKEN_BLOCKLIST_TTL_SECONDS = '21600'

      // Database
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '120000'
      process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS = '10'
      process.env.APP_DATABASE_RETRY_BACKOFF_BASE_MS = '5000'
      process.env.APP_DATABASE_CONNECTION_TIMEOUT_MS = '15000'

      // Limits
      process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB = '5000'
      process.env.APP_LIMITS_PLAYER_QUERY_LIMIT = '50000'
      process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER = '20'
      process.env.APP_LIMITS_PAGINATION_TOURNAMENTS = '100'
      process.env.APP_LIMITS_PAGINATION_MATCHES = '200'
      process.env.APP_LIMITS_PAGINATION_PLAYERS = '500'
      process.env.APP_LIMITS_EMAIL_AUDIT_THRESHOLD = '2000'
      process.env.APP_LIMITS_EMAIL_WARNING_THRESHOLD = '1000'
      process.env.APP_LIMITS_EMAIL_WARNING_PERCENT = '95'

      // Jobs
      process.env.APP_JOBS_MAX_ATTEMPTS = '8'
      process.env.APP_JOBS_BACKOFF_BASE = '5000'

      const config = getAppConfig()

      // Verify all custom values are loaded
      expect(config.auth.magicLinkTtlSeconds).toBe(7200)
      expect(config.auth.sessionTtlSeconds).toBe(14400)
      expect(config.auth.tokenBlocklistTtlSeconds).toBe(21600)
      expect(config.database.queryTimeoutMs).toBe(120000)
      expect(config.database.retryMaxAttempts).toBe(10)
      expect(config.database.retryBackoffBaseMs).toBe(5000)
      expect(config.database.connectionTimeoutMs).toBe(15000)
      expect(config.limits.emailRecipientsPerJob).toBe(5000)
      expect(config.limits.playerQueryLimit).toBe(50000)
      expect(config.limits.sseMaxConnectionsPerUser).toBe(20)
      expect(config.limits.paginationDefaults.tournaments).toBe(100)
      expect(config.limits.paginationDefaults.matches).toBe(200)
      expect(config.limits.paginationDefaults.players).toBe(500)
      expect(config.limits.emailAuditThresholds.auditLogThreshold).toBe(2000)
      expect(config.limits.emailAuditThresholds.warningLogThreshold).toBe(1000)
      expect(config.limits.emailAuditThresholds.warningPercentOfLimit).toBe(95)
      expect(config.jobs.maxAttempts).toBe(8)
      expect(config.jobs.backoffBase).toBe(5000)
    })
  })

  describe('getAppConfig() - Structure Validation', () => {
    it('returns AppConfig object with correct structure', () => {
      const config = getAppConfig()

      // Verify all top-level sections exist
      expect(config).toHaveProperty('auth')
      expect(config).toHaveProperty('database')
      expect(config).toHaveProperty('limits')
      expect(config).toHaveProperty('jobs')

      // Verify auth section
      expect(config.auth).toHaveProperty('magicLinkTtlSeconds')
      expect(config.auth).toHaveProperty('sessionTtlSeconds')
      expect(config.auth).toHaveProperty('tokenBlocklistTtlSeconds')

      // Verify database section
      expect(config.database).toHaveProperty('queryTimeoutMs')
      expect(config.database).toHaveProperty('retryMaxAttempts')
      expect(config.database).toHaveProperty('retryBackoffBaseMs')
      expect(config.database).toHaveProperty('connectionTimeoutMs')

      // Verify limits section
      expect(config.limits).toHaveProperty('emailRecipientsPerJob')
      expect(config.limits).toHaveProperty('playerQueryLimit')
      expect(config.limits).toHaveProperty('sseMaxConnectionsPerUser')
      expect(config.limits).toHaveProperty('paginationDefaults')
      expect(config.limits).toHaveProperty('emailAuditThresholds')

      // Verify nested pagination defaults
      expect(config.limits.paginationDefaults).toHaveProperty('tournaments')
      expect(config.limits.paginationDefaults).toHaveProperty('matches')
      expect(config.limits.paginationDefaults).toHaveProperty('players')

      // Verify nested email audit thresholds
      expect(config.limits.emailAuditThresholds).toHaveProperty('auditLogThreshold')
      expect(config.limits.emailAuditThresholds).toHaveProperty('warningLogThreshold')
      expect(config.limits.emailAuditThresholds).toHaveProperty('warningPercentOfLimit')

      // Verify jobs section
      expect(config.jobs).toHaveProperty('maxAttempts')
      expect(config.jobs).toHaveProperty('backoffBase')
    })

    it('returns configuration with all numeric values', () => {
      const config = getAppConfig()

      // Auth
      expect(typeof config.auth.magicLinkTtlSeconds).toBe('number')
      expect(typeof config.auth.sessionTtlSeconds).toBe('number')
      expect(typeof config.auth.tokenBlocklistTtlSeconds).toBe('number')

      // Database
      expect(typeof config.database.queryTimeoutMs).toBe('number')
      expect(typeof config.database.retryMaxAttempts).toBe('number')
      expect(typeof config.database.retryBackoffBaseMs).toBe('number')
      expect(typeof config.database.connectionTimeoutMs).toBe('number')

      // Limits
      expect(typeof config.limits.emailRecipientsPerJob).toBe('number')
      expect(typeof config.limits.playerQueryLimit).toBe('number')
      expect(typeof config.limits.sseMaxConnectionsPerUser).toBe('number')
      expect(typeof config.limits.paginationDefaults.tournaments).toBe('number')
      expect(typeof config.limits.paginationDefaults.matches).toBe('number')
      expect(typeof config.limits.paginationDefaults.players).toBe('number')
      expect(typeof config.limits.emailAuditThresholds.auditLogThreshold).toBe('number')
      expect(typeof config.limits.emailAuditThresholds.warningLogThreshold).toBe('number')
      expect(typeof config.limits.emailAuditThresholds.warningPercentOfLimit).toBe('number')

      // Jobs
      expect(typeof config.jobs.maxAttempts).toBe('number')
      expect(typeof config.jobs.backoffBase).toBe('number')
    })
  })

  describe('getAppConfig() - Edge Cases', () => {
    it('handles whitespace in environment variable values', () => {
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = ' 5000 '
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '  30000  '

      const config = getAppConfig()

      // parseInt should handle leading/trailing whitespace
      expect(config.auth.magicLinkTtlSeconds).toBe(5000)
      expect(config.database.queryTimeoutMs).toBe(30000)
    })

    it('handles minimum positive values', () => {
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '1'
      process.env.APP_LIMITS_SSE_MAX_CONNECTIONS_PER_USER = '1'

      const config = getAppConfig()

      expect(config.auth.magicLinkTtlSeconds).toBe(1)
      expect(config.limits.sseMaxConnectionsPerUser).toBe(1)
    })

    it('handles production-like configuration', () => {
      // Simulate production environment
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '86400'
      process.env.APP_AUTH_SESSION_TTL_SECONDS = '86400'
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '30000'
      process.env.APP_DATABASE_RETRY_MAX_ATTEMPTS = '3'
      process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB = '1000'
      process.env.APP_JOBS_MAX_ATTEMPTS = '3'

      const config = getAppConfig()

      // Verify production defaults are properly loaded
      expect(config.auth.magicLinkTtlSeconds).toBe(86400)
      expect(config.auth.sessionTtlSeconds).toBe(86400)
      expect(config.database.queryTimeoutMs).toBe(30000)
      expect(config.database.retryMaxAttempts).toBe(3)
      expect(config.limits.emailRecipientsPerJob).toBe(1000)
      expect(config.jobs.maxAttempts).toBe(3)
    })

    it('handles development-like configuration', () => {
      // Simulate development environment with custom settings
      process.env.APP_AUTH_MAGIC_LINK_TTL_SECONDS = '3600'
      process.env.APP_DATABASE_QUERY_TIMEOUT_MS = '60000'
      process.env.APP_LIMITS_EMAIL_RECIPIENTS_PER_JOB = '100'

      const config = getAppConfig()

      expect(config.auth.magicLinkTtlSeconds).toBe(3600)
      expect(config.database.queryTimeoutMs).toBe(60000)
      expect(config.limits.emailRecipientsPerJob).toBe(100)
    })
  })
})
