/**
 * ISSUE-16 — Partner pairing is first-*inviter*-wins: an invite mutates the
 * invitee's registration.
 *
 * Covers the doc's Fix (TDD §4) RED list, cases (a), (b), (e), (g), (h),
 * (i), (j) — the ones not already exercised elsewhere:
 *   (c) two branch-C invites, second-accept 409           → partner-confirm-atomicity.spec.ts
 *   (d) an invite does not create/modify the invitee's row → partner-invite-by-email.spec.ts
 *       ("sets pending state..." / branch B / "does not touch the invited
 *       existing player" — all assert targetReg is undefined)
 *   (f) an invite to a CONFIRMED player still 409s          → partner-invite-by-email.spec.ts
 *       ("rejects an invite to an already-partnered player")
 *
 * Owner decision (2026-07-23): A inviting X must never stop B inviting X.
 * Whichever pairing X accepts becomes final; the rest fail at accept time.
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

describe('ISSUE-16 — invite-is-a-claim model', () => {
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

  async function openDoubles(overrides: Record<string, unknown> = {}) {
    const organizerId = OrganizerFactory.id()
    return (await TournamentFactory.open(pool, organizerId, { matchFormat: 'doubles', ...overrides }))!
  }

  async function session(playerId: string, tournamentId: string) {
    const s = await generatePlayerSession(
      { playerId, tournamentId, email: `${playerId}@test.local`, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return s.token
  }

  /** Registers a fresh requester via the public route, inviting `partnerEmail`. */
  async function registerWithInvite(tournamentId: string, partnerEmail: string, requesterEmail = `req-${uid()}@test.local`) {
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({ email: requesterEmail, name: `Requester ${uid()}`, dob_attestation: defaultAdultAttestation(), partnerEmail })
    return { res, requesterEmail }
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

  async function personalNotifications(playerId: string) {
    const result = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.type = 'personal' AND c.player_id = $1
       ORDER BY gm.created_at`,
      [playerId]
    )
    return result.rows as { body: string }[]
  }

  // (a)
  it('(a) A and B both invite the same existing player — both succeed', async () => {
    const tournament = await openDoubles()
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournament.id)

    const { res: resA } = await registerWithInvite(tournament.id, x.email)
    const { res: resB } = await registerWithInvite(tournament.id, x.email)

    expect(resA.status).toBe(202)
    expect(resB.status).toBe(202)
  })

  // (b)
  it('(b) X confirms A, then B → 409, and A stays confirmed untouched', async () => {
    const tournament = await openDoubles()
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournament.id)

    const { res: resA, requesterEmail: aEmail } = await registerWithInvite(tournament.id, x.email)
    const { res: resB, requesterEmail: bEmail } = await registerWithInvite(tournament.id, x.email)
    expect(resA.status).toBe(202)
    expect(resB.status).toBe(202)

    const aPlayer = await playerRepo.findByEmail(aEmail)
    const bPlayer = await playerRepo.findByEmail(bEmail)
    const aReg = (await playerRepo.findRegistration(aPlayer!.id, tournament.id))!
    const bReg = (await playerRepo.findRegistration(bPlayer!.id, tournament.id))!

    const confirmA = await confirmReg(tournament.id, x.id, aReg.id)
    expect(confirmA.status).toBe(200)

    const confirmB = await confirmReg(tournament.id, x.id, bReg.id)
    expect(confirmB.status).toBe(409)

    const aRegAfter = await playerRepo.findRegistrationById(aReg.id)
    expect(aRegAfter?.partner_confirmed).toBe(true)
    expect(aRegAfter?.partner_id).toBe(x.id)

    // B keeps a valid, unconfirmed solo registration — not corrupted.
    const bRegAfter = await playerRepo.findRegistrationById(bReg.id)
    expect(bRegAfter?.partner_confirmed).toBe(false)
  })

  // (e)
  it('(e) pending invites do not reserve capacity — only real registrations count toward max_players', async () => {
    const tournament = await openDoubles({ maxPlayers: 2 })

    // A and B each take one of the two real seats, each ALSO inviting a
    // brand-new email that holds no capacity of its own.
    const { res: resA } = await registerWithInvite(tournament.id, `partner-a-${uid()}@test.local`)
    const { res: resB } = await registerWithInvite(tournament.id, `partner-b-${uid()}@test.local`)
    expect(resA.status).toBe(202)
    expect(resB.status).toBe(202)

    // The tournament is genuinely full now (2 real registrations at
    // max_players = 2) — a third solo is correctly refused.
    const third = await request(app)
      .post(`/tournaments/${tournament.id}/register`)
      .send({ email: `third-${uid()}@test.local`, name: 'Third', dob_attestation: defaultAdultAttestation() })
    expect(third.status).toBe(409)
    expect(third.body.code).toBe('TOURNAMENT_FULL')
  })

  // (g) — the requirement-6 regression a status-only fix would still pass.
  it('(g) A, holding an outgoing claim on X, is still returned by available-partners for a third player', async () => {
    const tournament = await openDoubles()
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournament.id)
    const c = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(c.id, tournament.id)

    const { requesterEmail: aEmail } = await registerWithInvite(tournament.id, x.email)
    const aPlayer = await playerRepo.findByEmail(aEmail)

    const available = await playerRepo.findAvailablePartners(tournament.id, c.id)
    expect(available.some(p => p.id === aPlayer!.id)).toBe(true)
  })

  // (h) — the requirement-8 regression: cancelling must not cross rows.
  it('(h) cancelling one claim does not touch an unrelated claim naming the same player', async () => {
    const tournament = await openDoubles()
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournament.id)
    const c = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(c.id, tournament.id)

    // A claims X (branch A/B).
    const { requesterEmail: aEmail } = await registerWithInvite(tournament.id, x.email)
    const aPlayer = await playerRepo.findByEmail(aEmail)
    const aReg = (await playerRepo.findRegistration(aPlayer!.id, tournament.id))!

    // X, independently, claims C via the requester's own outgoing invite
    // (X registers via the public route so X's own row is the claim record).
    const xClaimReg = await playerRepo.updateRegistrationWithPartner(
      (await playerRepo.findRegistration(x.id, tournament.id))!.id,
      c.id
    )
    expect(xClaimReg.partner_id).toBe(c.id)

    // X cancels their own claim on C. A's claim on X must survive.
    const xToken = await session(x.id, tournament.id)
    const cancelX = await request(app)
      .delete(`/tournaments/registrations/${xClaimReg.id}/partner-invite`)
      .set('Authorization', `Bearer ${xToken}`)
    expect(cancelX.status).toBe(200)

    const xRegAfter = await playerRepo.findRegistrationById(xClaimReg.id)
    expect(xRegAfter?.partner_id).toBeNull()
    const aRegAfter = await playerRepo.findRegistrationById(aReg.id)
    expect(aRegAfter?.partner_id).toBe(x.id)

    // Reverse: re-establish X's claim on C, then A cancels their claim on X.
    // X's claim on C must survive A's cancel.
    await playerRepo.updateRegistrationWithPartner(xClaimReg.id, c.id)
    const aToken = await session(aPlayer!.id, tournament.id)
    const cancelA = await request(app)
      .delete(`/tournaments/registrations/${aReg.id}/partner-invite`)
      .set('Authorization', `Bearer ${aToken}`)
    expect(cancelA.status).toBe(200)

    const xRegFinal = await playerRepo.findRegistrationById(xClaimReg.id)
    expect(xRegFinal?.partner_id).toBe(c.id)
  })

  // (i) — the requirement-5 email-form regression a partner_id-only void would miss.
  it('(i) A and B both invite the same brand-new address; X accepts A → B is voided and notified', async () => {
    const tournament = await openDoubles()
    const partnerEmail = `brand-new-${uid()}@test.local`

    const { requesterEmail: aEmail } = await registerWithInvite(tournament.id, partnerEmail)
    const { requesterEmail: bEmail } = await registerWithInvite(tournament.id, partnerEmail)
    const bPlayer = await playerRepo.findByEmail(bEmail)

    const sent = emailAdapter.getSentTo(partnerEmail)
    expect(sent).toHaveLength(2)
    const tokenA = extractToken(sent[0].body, `/tournament/${tournament.id}/partner-invite`)

    const accept = await request(app)
      .post(`/tournaments/${tournament.id}/partner-invites/accept`)
      .send({ token: tokenA, email: partnerEmail, name: 'X', dob_attestation: defaultAdultAttestation() })
    expect(accept.status).toBe(200)

    const aPlayer = await playerRepo.findByEmail(aEmail)
    const bReg = (await playerRepo.findRegistration(bPlayer!.id, tournament.id))!
    expect(bReg.pending_partner_email).toBeNull()

    const bNotifs = await personalNotifications(bPlayer!.id)
    expect(bNotifs.some(n => n.body.includes(aPlayer!.name) || /no longer available/i.test(n.body))).toBe(true)
  })

  // (j) — findIncomingPartnerRequests fails quietly (returns []) if this regresses.
  it('(j) GET /:id/partner-requests still returns incoming claims after the status enum change', async () => {
    const tournament = await openDoubles()
    const a = await PlayerFactory.create(pool)
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(a.id, tournament.id)
    await playerRepo.createRegistration(x.id, tournament.id)

    const aReg = (await playerRepo.findRegistration(a.id, tournament.id))!
    await playerRepo.updateRegistrationWithPartner(aReg.id, x.id)

    const res = await request(app)
      .get(`/tournaments/${tournament.id}/partner-requests`)
      .set('Authorization', `Bearer ${await session(x.id, tournament.id)}`)

    expect(res.status).toBe(200)
    expect(res.body.requests).toHaveLength(1)
    expect(res.body.requests[0].requesterId).toBe(a.id)
  })
})
