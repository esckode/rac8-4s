/**
 * ISSUE-11 — POST /:tournamentId/register is public, unauthenticated, and
 * was unthrottled: any anonymous caller could make the server send a
 * magic-link email to any address, repeatedly (email-bombing / SES-
 * reputation vector). Two independent limiter keys are required:
 *   - per-email (sharp): a legit user registers a given address ~once.
 *   - per-IP (generous): bounds a runaway cannon from one source, while
 *     staying loose enough for a shared venue Wi-Fi / one captain
 *     registering several people from one phone.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { TournamentFactory, OrganizerFactory } from '../factories'
import { clearRateLimitStore } from '../../middleware/rate-limit'
import { defaultAdultAttestation } from '../factories/player.factory'

const ADULT_ATTESTATION = defaultAdultAttestation()

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-11 — POST /:tournamentId/register rate limiting', () => {
  let pool: Pool
  let app: Express

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
  })

  async function openTournament() {
    const organizerId = OrganizerFactory.id()
    return TournamentFactory.open(pool, organizerId)
  }

  describe('per-email limit', () => {
    // maxAttempts is the count at which blocking starts (matching the
    // existing login/forgot-password convention), so only maxAttempts - 1
    // requests succeed before the next one is blocked.
    it('allows registration attempts up to the configured per-email limit', async () => {
      const email = `rl-email-${uid()}@test.local`

      for (let i = 0; i < 2; i++) {
        const tournament = await openTournament()
        const res = await request(app)
          .post(`/tournaments/${tournament!.id}/register`)
          .send({ email, name: 'Player', dob_attestation: ADULT_ATTESTATION })
        expect(res.status).toBe(202)
      }
    })

    it('rate limits the same email across different tournaments after the limit', async () => {
      const email = `rl-email-over-${uid()}@test.local`

      for (let i = 0; i < 2; i++) {
        const tournament = await openTournament()
        const res = await request(app)
          .post(`/tournaments/${tournament!.id}/register`)
          .send({ email, name: 'Player', dob_attestation: ADULT_ATTESTATION })
        expect(res.status).toBe(202)
      }

      const tournament = await openTournament()
      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({ email, name: 'Player', dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(429)
      expect(res.body.code).toBe('RATE_LIMITED')
    })

    it('rate limits per-email regardless of case', async () => {
      const email = `rl-case-${uid()}@test.local`

      for (let i = 0; i < 2; i++) {
        const tournament = await openTournament()
        const res = await request(app)
          .post(`/tournaments/${tournament!.id}/register`)
          .send({ email: i % 2 === 0 ? email.toUpperCase() : email, name: 'Player', dob_attestation: ADULT_ATTESTATION })
        expect(res.status).toBe(202)
      }

      const tournament = await openTournament()
      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({ email: email.toLowerCase(), name: 'Player', dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(429)
    })

    it('does not rate limit a different email after one email is exhausted', async () => {
      const email = `rl-exhaust-${uid()}@test.local`
      for (let i = 0; i < 3; i++) {
        const tournament = await openTournament()
        await request(app)
          .post(`/tournaments/${tournament!.id}/register`)
          .send({ email, name: 'Player', dob_attestation: ADULT_ATTESTATION })
      }

      const otherEmail = `rl-other-${uid()}@test.local`
      const tournament = await openTournament()
      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({ email: otherEmail, name: 'Player', dob_attestation: ADULT_ATTESTATION })

      expect(res.status).toBe(202)
    })
  })

  describe('per-IP limit (generous)', () => {
    it('allows a burst of distinct emails from one IP to stay under the generous per-IP cap', async () => {
      for (let i = 0; i < 10; i++) {
        const tournament = await openTournament()
        const res = await request(app)
          .post(`/tournaments/${tournament!.id}/register`)
          .send({ email: `rl-ip-${uid()}@test.local`, name: 'Player', dob_attestation: ADULT_ATTESTATION })
        expect(res.status).toBe(202)
      }
    })
  })

  describe('malformed / missing email tolerance', () => {
    it('does not crash the limiter on a missing email — handler still returns its own 400', async () => {
      const tournament = await openTournament()
      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({ name: 'Player' })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('does not crash the limiter on a non-string email', async () => {
      const tournament = await openTournament()
      const res = await request(app)
        .post(`/tournaments/${tournament!.id}/register`)
        .send({ email: 12345, name: 'Player' })

      expect(res.status).toBe(400)
    })
  })
})
