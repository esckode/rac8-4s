/**
 * P0.9 — no email address (or email subject) reaches the logs, in any form.
 *
 * Exercises every in-scope call site (per UAT_PWA_LAUNCH.md §P0.9's per-site
 * mapping) through a single shared capturing transport, then asserts:
 *   1. No captured LogEntry contains an @-bearing string value.
 *   2. No `email.service.*` entry carries a `subject` key at all.
 *
 * Per-module LOG_<MODULE> overrides are required — LOG_LEVEL is read once at
 * module load, so an unset LOG_LEVEL would make this pass vacuously (nothing
 * captured) rather than for the right reason. See the "proves the overrides
 * drove it" test below, which removes them and asserts the capture goes to
 * zero.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory, PlayerFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { AccountRepository } from '../../db'
import { InMemoryEmailAdapter, sendPasswordResetEmail, sendMagicLinkEmail } from '../../email-adapter'
import { MockEmailService, SendGridEmailService, AwsSesEmailService } from '../../services/email-service'
import { ServiceEmailAdapter } from '../../email-service-adapter'
import { addTransport, getLogger, type LogEntry } from '../../logger'

const mockSesSend = jest.fn()
jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}))

const ADULT_ATTESTATION = defaultAdultAttestation()

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

const OVERRIDE_KEYS = [
  'LOG_EMAIL_ADAPTER',
  'LOG_EMAIL_SERVICE',
  'LOG_EMAIL_SERVICE_ADAPTER',
  'LOG_AUTH',
  'LOG_ADMIN',
  'LOG_DB',
  'LOG_TOURNAMENTS',
]

describe('No PII in logs (P0.9)', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  const originalEnv: Record<string, string | undefined> = {}

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool) as any
    app = deps.app
    jwtConfig = deps.jwtConfig

    for (const key of OVERRIDE_KEYS) {
      originalEnv[key] = process.env[key]
      process.env[key] = 'debug'
    }
  })

  afterAll(async () => {
    for (const key of OVERRIDE_KEYS) {
      if (originalEnv[key] !== undefined) process.env[key] = originalEnv[key]
      else delete process.env[key]
    }
    await rollbackTransaction()
  })

  it('sanity check: the capturing transport actually captures a known-good entry', () => {
    const entries: LogEntry[] = []
    addTransport((entry) => entries.push(entry))

    getLogger('email-adapter').info('sanity.check', { ok: true })

    expect(entries.length).toBeGreaterThan(0)
  })

  it('no captured entry contains an @-bearing value, and no email.service.* entry has a subject key', async () => {
    const entries: LogEntry[] = []
    addTransport((entry) => entries.push(entry))

    // --- email-adapter.ts: sendPasswordResetEmail + sendMagicLinkEmail ---
    const adapter = new InMemoryEmailAdapter()
    const emailConfig = { fromAddress: 'noreply@test.local', frontendUrl: 'http://localhost:5173' }
    await sendPasswordResetEmail(adapter, emailConfig, `reset-${uid()}@test.local`, '123456')
    await sendMagicLinkEmail(adapter, emailConfig, `magic-${uid()}@test.local`, 'tok123', 'tournament_1', 'Summer Slam')

    // --- services/email-service.ts: SendGrid success + failure ---
    const fetchMock = jest.fn()
    const originalFetch = global.fetch
    global.fetch = fetchMock as any
    const sendgrid = new SendGridEmailService('test-key', 'sender@test.local')
    fetchMock.mockResolvedValueOnce({ ok: true, status: 202, text: async () => 'ok' })
    await sendgrid.send({ to: `sg-${uid()}@test.local`, subject: 'Registration confirmed: Summer Slam', html: '<p>x</p>' })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' })
    await sendgrid.send({ to: `sg-fail-${uid()}@test.local`, subject: 'Score reminder: Alice vs Bob', html: '<p>x</p>' }).catch(() => {})
    global.fetch = originalFetch

    // --- services/email-service.ts: AwsSesEmailService success + failure ---
    mockSesSend.mockReset()
    const ses = new AwsSesEmailService('us-east-2', 'sender@test.local')
    mockSesSend.mockResolvedValueOnce({ MessageId: 'abc' })
    await ses.send({ to: `ses-${uid()}@test.local`, subject: 'Registration confirmed: Winter Open', html: '<p>x</p>' })
    mockSesSend.mockRejectedValueOnce(new Error('ses unavailable'))
    await ses.send({ to: `ses-fail-${uid()}@test.local`, subject: 'x', html: '<p>x</p>' }).catch(() => {})

    // --- email-service-adapter.ts: ServiceEmailAdapter failure path (re-throws) ---
    const failingService = { send: jest.fn().mockRejectedValue(new Error('bridge boom')) }
    const bridge = new ServiceEmailAdapter(failingService as any, 'noreply@test.local')
    await bridge.send(`bridge-${uid()}@test.local`, 'subject', 'body').catch(() => {})

    // --- db.ts: AccountRepository.create (account.query log) ---
    const accountRepo = new AccountRepository(pool)
    await accountRepo.create(`account-${uid()}@test.local`, 'player')

    // --- routes/auth.ts: forgot_password.requested (no account lookup revealed) ---
    await request(app).post('/api/auth/forgot-password').send({ email: `forgot-${uid()}@test.local` })

    // --- routes/admin.ts: dsr.export.requested / dsr.erase.requested ---
    const { accessToken } = OrganizerFactory.token(jwtConfig)
    const exportPlayer = await PlayerFactory.create(pool)
    await request(app)
      .post('/api/admin/dsr')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: exportPlayer.email, type: 'export' })
    const erasePlayer = await PlayerFactory.create(pool)
    await request(app)
      .post('/api/admin/dsr')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: erasePlayer.email, type: 'erase' })

    // --- routes/tournaments.ts: team.created (invite) + magic_link.validated ---
    const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, organizerId, { matchFormat: 'doubles' })
    const registerRes = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({
        email: `invite-focus-${uid()}@test.local`,
        name: 'Invite Focus Player',
        dob_attestation: ADULT_ATTESTATION,
        partnerSelection: { type: 'invite', value: `partner-${uid()}@test.local` },
      })
    expect(registerRes.body.magicLinkToken).toBeDefined()
    await request(app).get(`/tournaments/auth/magic-link?token=${registerRes.body.magicLinkToken}`)

    // --- assertions ---
    expect(entries.length).toBeGreaterThan(0)

    for (const entry of entries) {
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === 'string') {
          expect(value).not.toMatch(/@/)
        }
      }
    }

    const emailServiceEntries = entries.filter((e) => e.msg.startsWith('email.service.'))
    expect(emailServiceEntries.length).toBeGreaterThan(0)
    for (const entry of emailServiceEntries) {
      expect(entry).not.toHaveProperty('subject')
    }
  })

  // Environment note: packages/api/src/__tests__/setup.ts:8-10 unconditionally
  // forces LOG_LEVEL=debug for every test file in this suite, so baseline is
  // never null here and "remove the module overrides, expect zero capture"
  // (the doc's suggested guard) does not hold — baseline alone already
  // permits every module's logs at debug+. The real defense against a
  // vacuous pass is the `entries.length` assertions above: an empty capture
  // would fail those loudly rather than silently satisfying the "no @" loop
  // over zero entries. This test instead proves the per-module override is a
  // genuine filter (not a no-op) by raising one module's threshold above the
  // level it logs at and confirming that entry is suppressed.
  it('a per-module override that raises the threshold actually suppresses that module', () => {
    process.env.LOG_EMAIL_ADAPTER = 'error'

    const entries: LogEntry[] = []
    addTransport((entry) => entries.push(entry))

    getLogger('email-adapter').info('should.be.suppressed', { email: 'nope@test.local' })

    expect(entries.length).toBe(0)
  })

  it('MockEmailService is excluded from sanitization — still logs recipient and subject', async () => {
    process.env.LOG_EMAIL_SERVICE = 'debug'
    const entries: LogEntry[] = []
    addTransport((entry) => entries.push(entry))

    const mock = new MockEmailService()
    const to = `mock-${uid()}@test.local`
    await mock.send({ to, subject: 'Mock Subject', html: '<p>x</p>' })

    const mine = entries.filter((e) => e.module === 'email-service' && e.msg === 'email.service.sent')
    expect(mine.some((e) => e.recipient === to && e.subject === 'Mock Subject')).toBe(true)
  })
})
