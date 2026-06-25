import type { AppConfig } from '../../config'

const mockLog = {
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}

jest.mock('../../logger', () => ({
  getLogger: jest.fn(() => mockLog),
}))

import { InMemoryJobQueue } from '@worker/job-queue'
import { QueueMonitor } from '../../queue-monitor'

const testConfig: AppConfig = {
  auth: {
    magicLinkTtlSeconds: 86400,
    sessionTtlSeconds: 86400,
    tokenBlocklistTtlSeconds: 86400,
  },
  database: {
    queryTimeoutMs: 30000,
    retryMaxAttempts: 3,
    retryBackoffBaseMs: 1000,
    connectionTimeoutMs: 5000,
  },
  limits: {
    emailRecipientsPerJob: 1000,
    playerQueryLimit: 10000,
    sseMaxConnectionsPerUser: 5,
    rateLimit: {
      loginMaxAttempts: 5,
      loginWindowMs: 15 * 60 * 1000,
      forgotPasswordMaxAttempts: 5,
      forgotPasswordWindowMs: 15 * 60 * 1000,
    },
    paginationDefaults: {
      tournaments: 20,
      matches: 20,
      players: 50,
    },
    emailAuditThresholds: {
      auditLogThreshold: 500,
      warningLogThreshold: 101,
      warningPercentOfLimit: 80,
    },
  },
  jobs: {
    maxAttempts: 3,
    backoffBase: 1000,
  },
  email: {
    fromAddress: 'noreply@example.com',
    frontendUrl: 'http://localhost:3000',
    service: 'mock',
  },
  messaging: {
    retentionDays: 90,
    dropPaddingDays: 45,
    monthsAhead: 2,
  },
  redis: {
    url: undefined,
    jobQueue: 'memory',
    sseBus: 'memory',
  },
}

describe('Task #8: Queue Monitoring', () => {
  let queue: InMemoryJobQueue
  let monitor: QueueMonitor

  beforeEach(async () => {
    jest.clearAllMocks()
    queue = new InMemoryJobQueue()
    monitor = new QueueMonitor(queue, testConfig)
  })

  describe('Enqueue timestamp tracking', () => {
    it('should record enqueuedAt timestamp when job is added', async () => {
      const before = Date.now()
      const job = await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: ['player1'],
        data: { tournamentName: 'Test' },
      })
      const after = Date.now()

      expect(job.enqueuedAt).toBeGreaterThanOrEqual(before)
      expect(job.enqueuedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('Email job audit logging (>= 500 recipients)', () => {
    it('should log audit event for 500 recipients', async () => {
      const recipientIds = Array.from({ length: 500 }, (_, i) => `p${i}`)
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds,
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.info).toHaveBeenCalledWith(
        'queue.job.audit',
        expect.objectContaining({
          jobType: 'email.send',
          recipientCount: 500,
        })
      )
    })

    it('should log audit event for 1000 recipients', async () => {
      const recipientIds = Array.from({ length: 1000 }, (_, i) => `p${i}`)
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds,
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.info).toHaveBeenCalledWith(
        'queue.job.audit',
        expect.objectContaining({
          recipientCount: 1000,
        })
      )
    })

    it('should include jobId and enqueuedAt in audit log', async () => {
      const job = await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: Array.from({ length: 600 }, (_, i) => `p${i}`),
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.info).toHaveBeenCalledWith(
        'queue.job.audit',
        expect.objectContaining({
          jobId: job.id,
          jobType: 'email.send',
          recipientCount: 600,
          enqueuedAt: expect.any(String),
        })
      )
    })

    it('should not log audit for 499 recipients', async () => {
      const recipientIds = Array.from({ length: 499 }, (_, i) => `p${i}`)
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds,
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.info).not.toHaveBeenCalled()
    })
  })

  describe('Near-limit warning (> 100 recipients)', () => {
    it('should warn for 101 recipients', async () => {
      const recipientIds = Array.from({ length: 101 }, (_, i) => `p${i}`)
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds,
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.warn).toHaveBeenCalledWith(
        'queue.job.near_limit',
        expect.objectContaining({
          jobType: 'email.send',
          recipientCount: 101,
          maxLimit: 1000,
        })
      )
    })

    it('should warn for 500 recipients (both warn and info)', async () => {
      const recipientIds = Array.from({ length: 500 }, (_, i) => `p${i}`)
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds,
        data: { tournamentName: 'Test' },
      })

      // Both warn (near-limit) and info (audit) should be called
      expect(mockLog.warn).toHaveBeenCalledWith(
        'queue.job.near_limit',
        expect.objectContaining({
          recipientCount: 500,
        })
      )
      expect(mockLog.info).toHaveBeenCalledWith(
        'queue.job.audit',
        expect.objectContaining({
          recipientCount: 500,
        })
      )
    })

    it('should not warn for exactly 100 recipients', async () => {
      const recipientIds = Array.from({ length: 100 }, (_, i) => `p${i}`)
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds,
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.warn).not.toHaveBeenCalled()
    })

    it('should not warn for small recipient lists', async () => {
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: ['p1', 'p2', 'p3'],
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.warn).not.toHaveBeenCalled()
      expect(mockLog.info).not.toHaveBeenCalled()
    })
  })

  describe('Non-email job handling', () => {
    it('should not log for non-email job types', async () => {
      await monitor.add('standings.recalculate', {
        tournamentId: 'tournament1',
        groupId: 'group1',
      })

      expect(mockLog.info).not.toHaveBeenCalled()
      expect(mockLog.warn).not.toHaveBeenCalled()
    })

    it('should allow bracket.generate jobs without logging', async () => {
      const job = await monitor.add('bracket.generate', {
        tournamentId: 'tournament1',
      })

      expect(job.id).toBeDefined()
      expect(mockLog.info).not.toHaveBeenCalled()
    })
  })

  describe('Queue interface delegation', () => {
    it('should delegate getJob to underlying queue', async () => {
      const job = await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: ['p1'],
        data: { tournamentName: 'Test' },
      })

      const retrieved = await monitor.getJob(job.id)
      expect(retrieved?.id).toBe(job.id)
    })

    it('should delegate getFailedJobs to underlying queue', async () => {
      const failed = monitor.getFailedJobs()
      expect(Array.isArray(failed)).toBe(true)
    })

    it('should delegate close to underlying queue', async () => {
      await monitor.close()
      // Should not throw
    })
  })

  describe('ISO timestamp format in logs', () => {
    it('should format enqueuedAt as ISO string in audit log', async () => {
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: Array.from({ length: 500 }, (_, i) => `p${i}`),
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.info).toHaveBeenCalledWith(
        'queue.job.audit',
        expect.objectContaining({
          enqueuedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/),
        })
      )
    })
  })

  describe('Job ID tracking', () => {
    it('should include jobId in monitoring logs', async () => {
      const job = await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: Array.from({ length: 300 }, (_, i) => `p${i}`),
        data: { tournamentName: 'Test' },
      })

      expect(mockLog.warn).toHaveBeenCalledWith(
        'queue.job.near_limit',
        expect.objectContaining({
          jobId: job.id,
        })
      )
    })

    it('should support custom jobId passed in opts', async () => {
      const customJobId = 'email.send:player123:registration'
      const job = await monitor.add(
        'email.send',
        {
          type: 'registration_confirmation',
          recipientIds: Array.from({ length: 250 }, (_, i) => `p${i}`),
          data: { tournamentName: 'Test' },
        },
        { jobId: customJobId }
      )

      expect(job.id).toBe(customJobId)
      expect(mockLog.warn).toHaveBeenCalledWith(
        'queue.job.near_limit',
        expect.objectContaining({
          jobId: customJobId,
        })
      )
    })
  })

  describe('Multiple jobs', () => {
    it('should monitor each job independently', async () => {
      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: Array.from({ length: 150 }, (_, i) => `p${i}`),
        data: { tournamentName: 'Test 1' },
      })

      await monitor.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: Array.from({ length: 600 }, (_, i) => `p${i}`),
        data: { tournamentName: 'Test 2' },
      })

      expect(mockLog.warn).toHaveBeenCalledTimes(2)
      expect(mockLog.info).toHaveBeenCalledTimes(1)
    })
  })
})
