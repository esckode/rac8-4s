/**
 * A2.3 — Reserved display names "ref" and "coach" (RED first)
 * N2 (Phase N, design §12 N-Q7) — "ref" added; "coach" stays reserved so the
 * retired identity can't be impersonated.
 *
 * No player may take the assistant's display name: signup and group
 * invite-accept both reject "ref"/"Ref"/"REF " and "coach"/"Coach"/"COACH "
 * (trimmed, case-insensitive) with 400 VALIDATION_ERROR, so the bot's sender
 * name can never be impersonated.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryEmailAdapter } from '../../email-adapter'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

const ADULT_ATTESTATION = defaultAdultAttestation()

describe('A2.3 — reserved display names "ref" and "coach"', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let emailAdapter: InMemoryEmailAdapter

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    emailAdapter = deps.emailAdapter
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('signup', () => {
    it.each(['Coach', 'coach', 'COACH ', ' coach ', 'Ref', 'ref', 'REF ', ' ref '])(
      'rejects signup with name %j (400 VALIDATION_ERROR)',
      async (name) => {
        const res = await request(app)
          .post('/api/auth/signup')
          .send({
            email: `reserved-${uid()}@test.local`,
            name,
            password: 'password123',
            dob_attestation: ADULT_ATTESTATION,
          })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('VALIDATION_ERROR')
      }
    )

    it('still accepts non-reserved names containing "coach" or "ref"', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          email: `coachman-${uid()}@test.local`,
          name: 'Coachman Bob',
          password: 'password123',
          dob_attestation: ADULT_ATTESTATION,
        })
      expect(res.status).toBe(201)

      const res2 = await request(app)
        .post('/api/auth/signup')
        .send({
          email: `refree-${uid()}@test.local`,
          name: 'Refree Bob',
          password: 'password123',
          dob_attestation: ADULT_ATTESTATION,
        })
      expect(res2.status).toBe(201)
    })
  })

  describe('group invite-accept', () => {
    async function ownerWithGroup(): Promise<{ groupId: string }> {
      const repo = new PlayerRepository(pool)
      const email = `rsvname-${uid()}@test.local`
      const owner = await repo.findOrCreatePlayerByEmail(
        email,
        `Owner ${uid()}`,
        undefined,
        undefined,
        defaultAdultAttestation()
      )
      const session = await generatePlayerSession(
        { playerId: owner.id, tournamentId: crypto.randomUUID(), email: owner.email, createdAt: Date.now() },
        3600,
        tokenStore
      )
      const res = await request(app)
        .post('/player/groups')
        .set('Authorization', `Bearer ${session.token}`)
        .send({ name: `Reserved Name Group ${uid()}` })
      expect(res.status).toBe(201)
      return { groupId: res.body.id as string }
    }

    it.each(['coach', 'ref'])(
      'rejects invite-accept with name %j (400 VALIDATION_ERROR)',
      async (name) => {
        const { groupId } = await ownerWithGroup()
        const inviteeEmail = `reserved-invitee-${uid()}@test.local`

        // Owner sends the invite; extract the email-bound token
        const ownerMembers = await pool.query(
          `SELECT player_id FROM public.player_group_members WHERE group_id = $1 AND role = 'owner'`,
          [groupId]
        )
        const ownerId = ownerMembers.rows[0].player_id as string
        const ownerRow = await pool.query(`SELECT email FROM public.players WHERE id = $1`, [ownerId])
        const ownerSession = await generatePlayerSession(
          { playerId: ownerId, tournamentId: crypto.randomUUID(), email: ownerRow.rows[0].email, createdAt: Date.now() },
          3600,
          tokenStore
        )
        emailAdapter.clear()
        await request(app)
          .post(`/player/groups/${groupId}/invites`)
          .set('Authorization', `Bearer ${ownerSession.token}`)
          .send({ email: inviteeEmail })
        const sent = emailAdapter.getSentTo(inviteeEmail)
        expect(sent).toHaveLength(1)
        const token = sent[0].body.match(/token=([0-9a-f]{64})/)?.[1]
        expect(token).toBeTruthy()

        const dob = new Date()
        dob.setFullYear(dob.getFullYear() - 25)
        const res = await request(app)
          .post(`/player/groups/${groupId}/invites/accept`)
          .send({
            token,
            email: inviteeEmail,
            name,
            ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
          })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('VALIDATION_ERROR')
      }
    )
  })
})
