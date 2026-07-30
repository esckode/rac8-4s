/**
 * Auth logging tests
 *
 * Verifies that login and logout events log the correct information,
 * including IP addresses and excluding PII per CLAUDE.md §6.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { createTestApp } from '../../helpers/app'
import { AccountRepository } from '../../../db'
import { clearRateLimitStore } from '../../../middleware/rate-limit'
import * as loggerModule from '../../../logger'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function uniqueEmail(prefix: string = ''): string {
  const id = uid()
  return `auth-log-test-${prefix}-${id}@test.local`.toLowerCase()
}

describe('Auth logging', () => {
  let pool: Pool
  let app: Express
  let accountRepo: AccountRepository
  let logEntries: any[] = []

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)

    // Set up environment to enable logging
    process.env.LOG_LEVEL = 'debug'

    // Capture log entries
    loggerModule.addTransport((entry) => {
      logEntries.push(entry)
    })

    const deps = createTestApp(pool)
    app = deps.app
    accountRepo = new AccountRepository(pool)
  })

  afterAll(async () => {
    clearRateLimitStore()
    await rollbackTransaction()
    delete process.env.LOG_LEVEL
  })

  beforeEach(() => {
    logEntries = []
    clearRateLimitStore()
  })

  describe('login.success logging', () => {
    it('logs login.success with accountId and ip', async () => {
      const email = uniqueEmail('logging-basic')
      const password = 'testpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(res.status).toBe(200)

      // Find the login.success log entry
      const loginSuccessEntry = logEntries.find(e => e.msg === 'login.success')
      if (!loginSuccessEntry) {
        console.log('Log entries:', logEntries)
      }
      expect(loginSuccessEntry).toBeDefined()
      expect(loginSuccessEntry.accountId).toBe(account.id)
      expect(loginSuccessEntry.ip).toBeDefined()

      // Verify email is NOT in the log
      expect(loginSuccessEntry).not.toHaveProperty('email')
    })

    it('logs login.success with correct client IP from X-Forwarded-For', async () => {
      const email = uniqueEmail('logging-xff')
      const password = 'testpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.9, 10.0.0.1')
        .send({ email, password })

      expect(res.status).toBe(200)

      // Find the login.success log entry
      // With trust proxy = 2, it should pick the second-to-last IP (203.0.113.9)
      const loginSuccessEntry = logEntries.find(e => e.msg === 'login.success')
      expect(loginSuccessEntry).toBeDefined()
      expect(loginSuccessEntry.ip).toBe('203.0.113.9')
    })
  })

  describe('logout logging', () => {
    it('logs logout with accountId and ip', async () => {
      const email = uniqueEmail('logout-logging')
      const password = 'testpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Login first
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      const token = loginRes.body.token

      // Clear log entries from login
      logEntries = []

      // Now logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)

      expect(logoutRes.status).toBe(204)

      // Find the logout log entry
      const logoutEntry = logEntries.find(e => e.msg === 'logout')
      expect(logoutEntry).toBeDefined()
      expect(logoutEntry.accountId).toBe(account.id)
      expect(logoutEntry.ip).toBeDefined()
    })

    it('logs logout with correct client IP from X-Forwarded-For', async () => {
      const email = uniqueEmail('logout-xff')
      const password = 'testpassword123'

      const account = await accountRepo.create(email, 'player')
      const passwordHash = await bcryptjs.hash(password, 10)
      await accountRepo.updatePasswordHash(account.id, passwordHash)

      // Login first
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.9, 10.0.0.1')
        .send({ email, password })

      expect(loginRes.status).toBe(200)
      const token = loginRes.body.token

      // Clear log entries from login
      logEntries = []

      // Now logout with X-Forwarded-For
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', '203.0.113.9, 10.0.0.1')

      expect(logoutRes.status).toBe(204)

      // Find the logout log entry
      // With trust proxy = 2, it should pick the second-to-last IP (203.0.113.9)
      const logoutEntry = logEntries.find(e => e.msg === 'logout')
      expect(logoutEntry).toBeDefined()
      expect(logoutEntry.ip).toBe('203.0.113.9')
    })
  })
})
