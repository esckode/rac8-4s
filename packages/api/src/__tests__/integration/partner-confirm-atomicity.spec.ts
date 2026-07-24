/**
 * ISSUE-18 — Confirming a partner has no accept-time guard, and `confirmPartner`
 * is not atomic. A player could end up on two "confirmed" teams because two
 * independent claims on the same target could both be confirmed, with the
 * second write silently overwriting the first (last write wins).
 *
 * Fix: a partial unique index on (tournament_id, partner_id) WHERE
 * partner_confirmed = true, an accept-time guard (confirmed partner only —
 * a merely pending claim must not block a second accept), 23505 mapped to
 * 409 INVALID_STATE, and confirmPartner wrapped in one transaction so a
 * failed second write never leaves a one-sided confirmed row.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory, PlayerFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { PlayerRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryEmailAdapter } from '../../email-adapter'
import { generatePlayerSession } from '../../auth/magic-link'
import { clearRateLimitStore } from '../../middleware/rate-limit'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-18 — confirmPartner atomicity + accept-time guard', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let emailAdapter: InMemoryEmailAdapter
  let playerRepo: PlayerRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    emailAdapter = deps.emailAdapter
    playerRepo = new PlayerRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
    emailAdapter.clear()
  })

  async function session(playerId: string, tournamentId: string) {
    const s = await generatePlayerSession(
      { playerId, tournamentId, email: `${playerId}@test.local`, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return s.token
  }

  async function setup(playerCount: number) {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, orgId, { matchFormat: 'doubles' })
    const players = []
    for (let i = 0; i < playerCount; i++) {
      const p = await PlayerFactory.create(pool)
      await playerRepo.createRegistration(p.id, tournament!.id)
      players.push(p)
    }
    return { tournamentId: tournament!.id, players, orgToken, orgId }
  }

  async function requestPartner(tournamentId: string, requesterId: string, targetId: string) {
    return request(app)
      .post(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(requesterId, tournamentId)}`)
      .send({ targetPlayerId: targetId })
  }

  async function confirmReg(tournamentId: string, callerId: string, registrationId: string) {
    return request(app)
      .patch(`/tournaments/registrations/${registrationId}/confirm`)
      .set('Authorization', `Bearer ${await session(callerId, tournamentId)}`)
  }

  function extractToken(body: string, pathFragment: string): string {
    const marker = `${pathFragment}?token=`
    const start = body.indexOf(marker)
    if (start === -1) throw new Error(`token not found in email for ${pathFragment}: ${body}`)
    return body.slice(start + marker.length, start + marker.length + 64)
  }

  // (a) + (c)
  it('two players claim the same target; the target confirms one and gets 409 on the other, and points at exactly one partner', async () => {
    const { tournamentId, players } = await setup(3)
    const [a, b, x] = players

    expect((await requestPartner(tournamentId, a.id, x.id)).status).toBe(201)
    expect((await requestPartner(tournamentId, b.id, x.id)).status).toBe(201)

    const aReg = (await playerRepo.findRegistration(a.id, tournamentId))!
    const bReg = (await playerRepo.findRegistration(b.id, tournamentId))!

    const confirmA = await confirmReg(tournamentId, x.id, aReg.id)
    expect(confirmA.status).toBe(200)

    const confirmB = await confirmReg(tournamentId, x.id, bReg.id)
    expect(confirmB.status).toBe(409)
    expect(confirmB.body.code).toBe('INVALID_STATE')

    // A's row is untouched and still confirmed.
    const finalA = await playerRepo.findRegistrationById(aReg.id)
    expect(finalA?.partner_confirmed).toBe(true)
    expect(finalA?.partner_id).toBe(x.id)

    // B keeps a valid, unconfirmed solo-side claim — not corrupted.
    const finalB = await playerRepo.findRegistrationById(bReg.id)
    expect(finalB?.partner_confirmed).toBe(false)

    // X points at exactly one partner: A.
    const xReg = await playerRepo.findRegistration(x.id, tournamentId)
    expect(xReg?.partner_id).toBe(a.id)
    expect(xReg?.partner_confirmed).toBe(true)
  })

  // (b)
  it('two branch-C invites to the same brand-new email; X accepts one and gets 409 on the other', async () => {
    const organizerId = OrganizerFactory.id()
    const tournament = await TournamentFactory.open(pool, organizerId, { matchFormat: 'doubles' })
    const partnerEmail = `brand-new-${uid()}@test.local`

    const reqA = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({ email: `req-a-${uid()}@test.local`, name: 'Requester A', dob_attestation: defaultAdultAttestation(), partnerEmail })
    expect(reqA.status).toBe(202)

    const reqB = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({ email: `req-b-${uid()}@test.local`, name: 'Requester B', dob_attestation: defaultAdultAttestation(), partnerEmail })
    expect(reqB.status).toBe(202)

    const sent = emailAdapter.getSentTo(partnerEmail)
    expect(sent).toHaveLength(2)
    const tokenA = extractToken(sent[0].body, `/tournament/${tournament!.id}/partner-invite`)
    const tokenB = extractToken(sent[1].body, `/tournament/${tournament!.id}/partner-invite`)

    const acceptA = await request(app)
      .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
      .send({ token: tokenA, email: partnerEmail, name: 'X', dob_attestation: defaultAdultAttestation() })
    expect(acceptA.status).toBe(200)

    const acceptB = await request(app)
      .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
      .send({ token: tokenB, email: partnerEmail, name: 'X', dob_attestation: defaultAdultAttestation() })
    expect(acceptB.status).toBe(409)
    expect(acceptB.body.code).toBe('INVALID_STATE')
  })

  it('the accept-time guard on /partner-invites/accept is confirmed-only: a merely pending targetReg does not block accept', async () => {
    const organizerId = OrganizerFactory.id()
    const tournament = await TournamentFactory.open(pool, organizerId, { matchFormat: 'doubles' })
    const partnerEmail = `brand-new-${uid()}@test.local`

    const reqA = await request(app)
      .post(`/tournaments/${tournament!.id}/register`)
      .send({ email: `req-${uid()}@test.local`, name: 'Requester', dob_attestation: defaultAdultAttestation(), partnerEmail })
    expect(reqA.status).toBe(202)

    const sent = emailAdapter.getSentTo(partnerEmail)
    const token = extractToken(sent[0].body, `/tournament/${tournament!.id}/partner-invite`)

    // Simulate the narrow race window a true concurrent second invite would
    // produce: X's player row + registration already exist with a PENDING
    // (unconfirmed) partner_id, as if some other pairing had reached
    // updateRegistrationWithPartner but not yet confirmPartner. The old
    // `targetReg?.partner_id` check refused this outright; the
    // confirmed-only guard (requirement 1) must not.
    const somebody = await PlayerFactory.create(pool)
    const xPlayer = await playerRepo.findOrCreatePlayerByEmail(partnerEmail, 'X', undefined, undefined, defaultAdultAttestation())
    const xReg = await playerRepo.createRegistration(xPlayer.id, tournament!.id)
    await pool.query(
      `UPDATE public.player_registrations SET partner_id = $1 WHERE id = $2`,
      [somebody.id, xReg.id]
    )

    const accept = await request(app)
      .post(`/tournaments/${tournament!.id}/partner-invites/accept`)
      .send({ token, email: partnerEmail, name: 'X', dob_attestation: defaultAdultAttestation() })

    expect(accept.status).toBe(200)
  })

  // (d)
  it('the partial unique index rejects a second confirmed row for the same (tournament_id, partner_id)', async () => {
    const { tournamentId, players } = await setup(3)
    const [a, b, x] = players

    await pool.query(
      `UPDATE public.player_registrations SET partner_id = $1, partner_confirmed = true WHERE player_id = $2 AND tournament_id = $3`,
      [x.id, a.id, tournamentId]
    )

    await expect(
      pool.query(
        `UPDATE public.player_registrations SET partner_id = $1, partner_confirmed = true WHERE player_id = $2 AND tournament_id = $3`,
        [x.id, b.id, tournamentId]
      )
    ).rejects.toThrow(/duplicate key|unique constraint/i)
  })

  // (e) + (f)
  it('confirmPartner leaves no one-sided row when the second write collides with the index (mapped to 409, not 500)', async () => {
    const { tournamentId, players } = await setup(3)
    const [gil, eli, fay] = players

    // Gil claims Eli; Eli claims Fay (both pending).
    expect((await requestPartner(tournamentId, gil.id, eli.id)).status).toBe(201)
    expect((await requestPartner(tournamentId, eli.id, fay.id)).status).toBe(201)

    const gilReg = (await playerRepo.findRegistration(gil.id, tournamentId))!
    const eliReg = (await playerRepo.findRegistration(eli.id, tournamentId))!

    // Eli confirms Gil's claim on him first — a real, sequential accept
    // that legitimately completes the Gil<->Eli team and takes the
    // confirmed-partner index slot for `partner_id = eli.id`.
    const confirmGil = await confirmReg(tournamentId, eli.id, gilReg.id)
    expect(confirmGil.status).toBe(200)

    // Reconstruct, by hand, the state Eli's row was in the instant before
    // Gil's confirm overwrote it — i.e. the interleaving a true concurrent
    // race would produce. Per CLAUDE.md §7 the single-connection test
    // harness can't reproduce genuine concurrency, so the race is driven
    // directly (per ISSUE-18's own note) rather than mocked.
    await pool.query(
      `UPDATE public.player_registrations
       SET partner_id = $1, partner_confirmed = false
       WHERE id = $2`,
      [fay.id, eliReg.id]
    )

    const beforeEli = await playerRepo.findRegistrationById(eliReg.id)
    const beforeFay = await playerRepo.findRegistration(fay.id, tournamentId)

    // Fay now confirms what looks like Eli's live claim on her. The
    // confirming player (Fay) has no confirmed partner of her own, so the
    // requirement-1 guard passes — this must be caught by the database
    // index inside confirmPartner's transaction instead.
    const confirmFay = await confirmReg(tournamentId, fay.id, eliReg.id)

    expect(confirmFay.status).toBe(409)
    expect(confirmFay.body.code).toBe('INVALID_STATE')

    const afterEli = await playerRepo.findRegistrationById(eliReg.id)
    const afterFay = await playerRepo.findRegistration(fay.id, tournamentId)

    // Neither row shows any trace of the failed second write — the whole
    // transaction rolled back, not just the statement that raised 23505.
    expect(afterEli?.partner_confirmed).toBe(beforeEli?.partner_confirmed)
    expect(afterEli?.partner_id).toBe(beforeEli?.partner_id)
    expect(afterEli?.status).toBe(beforeEli?.status)
    expect(afterFay?.partner_id).toBe(beforeFay?.partner_id)
    expect(afterFay?.partner_confirmed).toBe(beforeFay?.partner_confirmed)
  })
})
