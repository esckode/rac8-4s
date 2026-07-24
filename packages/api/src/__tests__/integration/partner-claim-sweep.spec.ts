/**
 * ISSUE-21 — An invite nobody answered becomes a real team at group creation.
 *
 * Written before ISSUE-16 shipped, when branches A/B of
 * POST /:tournamentId/register still mirror-wrote a pending invite onto
 * BOTH the requester's and the invitee's registration (partner_id set
 * mutually, status = 'pending_partner_confirm'). createGroupsForDoubles's
 * mutuality check only required partner_id to point both ways — it never
 * checked partner_confirmed — so an invite nobody ever confirmed still
 * became a real team at group creation.
 *
 * Fix: sweep every unconfirmed claim (partner_id = NULL — and, post-
 * ISSUE-16, pending_partner_email/partner_claimed_at too) as the first
 * statement inside createGroupsForDoubles's transaction, before any
 * pairing is planned, and tighten the mutuality check to require
 * partner_confirmed on both sides as a backstop. Swept players re-enter
 * the leftover pool and are notified by the existing ISSUE-19 teams.formed
 * pipeline like any other auto-paired or unpaired player — no bespoke
 * notification copy needed for this issue.
 *
 * ISSUE-16 update: an invite now writes only the requester's own row, so
 * the "mutually linked but unconfirmed" scenario this issue was written
 * against can no longer arise from an invite at all — ISSUE-16 requirement
 * 1 is the durable closure. The sweep and the tightened check both remain:
 * the sweep now also prevents a stale, unanswered OUTGOING claim from
 * lingering on a registration that group creation auto-pairs with someone
 * else (createTeam never touches player_registrations), and the tightened
 * check is unchanged defense-in-depth.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory, PlayerFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { PlayerRepository, TournamentRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { clearRateLimitStore } from '../../middleware/rate-limit'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-21 — unconfirmed claims are swept at group creation', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let playerRepo: PlayerRepository
  let tournamentRepo: TournamentRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    playerRepo = new PlayerRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
  })

  async function session(playerId: string, tournamentId: string) {
    const s = await generatePlayerSession(
      { playerId, tournamentId, email: `${playerId}@test.local`, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return s.token
  }

  async function openDoublesTournament() {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, orgId, { matchFormat: 'doubles' })
    return { tournamentId: tournament!.id, orgToken, orgId }
  }

  /** Registers `requester` fresh via the public route, mirror-inviting `partner` (branches A/B). */
  async function inviteExisting(tournamentId: string, partnerEmail: string) {
    const requester = { email: `req-${uid()}@test.local`, name: `Requester ${uid()}` }
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({ email: requester.email, name: requester.name, dob_attestation: defaultAdultAttestation(), partnerEmail })
    if (res.status !== 202) throw new Error(`invite failed: ${res.status} ${JSON.stringify(res.body)}`)
    const requesterPlayer = (await playerRepo.findByEmail(requester.email))!
    return requesterPlayer
  }

  async function confirmedPair(tournamentId: string) {
    const e = await PlayerFactory.create(pool)
    const f = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(e.id, tournamentId)
    await playerRepo.createRegistration(f.id, tournamentId)
    const eReg = (await playerRepo.findRegistration(e.id, tournamentId))!
    await playerRepo.updateRegistrationWithPartner(eReg.id, f.id)
    await playerRepo.confirmPartner(eReg.id)
    return { e, f }
  }

  async function createGroups(tournamentId: string, orgToken: string, pairUnpaired: boolean) {
    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    return request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1, pairUnpaired })
  }

  async function teamsFor(tournamentId: string) {
    const result = await pool.query(
      `SELECT player1_id, player2_id FROM public.teams WHERE tournament_id = $1`,
      [tournamentId]
    )
    return result.rows as { player1_id: string; player2_id: string }[]
  }

  function hasTeam(teams: { player1_id: string; player2_id: string }[], p1: string, p2: string): boolean {
    return teams.some(
      t => (t.player1_id === p1 && t.player2_id === p2) || (t.player1_id === p2 && t.player2_id === p1)
    )
  }

  // (a) — the headline regression.
  it('an invite X never answers is not honored as a team at group creation', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const { e, f } = await confirmedPair(tournamentId)
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournamentId)
    const a = await inviteExisting(tournamentId, x.email)

    // Sanity: A's own outgoing claim on X exists and nobody confirmed it —
    // ISSUE-16 requirement 6, a claim never changes status.
    const aRegBefore = (await playerRepo.findRegistration(a.id, tournamentId))!
    expect(aRegBefore.status).toBe('registered')
    expect(aRegBefore.partner_id).toBe(x.id)
    expect(aRegBefore.partner_confirmed).toBe(false)

    const groupsRes = await createGroups(tournamentId, orgToken, false)
    expect(groupsRes.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    expect(teams).toHaveLength(1)
    expect(hasTeam(teams, e.id, f.id)).toBe(true)
    expect(hasTeam(teams, a.id, x.id)).toBe(false)

    const aRegAfter = (await playerRepo.findRegistration(a.id, tournamentId))!
    const xRegAfter = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect(aRegAfter.status).toBe('unpaired')
    expect(aRegAfter.partner_id).toBeNull()
    expect(xRegAfter.status).toBe('unpaired')
    expect(xRegAfter.partner_id).toBeNull()
  })

  // (b) — the backstop mutuality check.
  //
  // Pre-ISSUE-16 this crafted a link the sweep's status filter deliberately
  // couldn't reach, isolating the tightened mutuality check. Post-ISSUE-16
  // the sweep filters only on partner_confirmed (no status filter left to
  // dodge), so it now also clears this scenario — the sweep and the
  // backstop cooperate rather than being independently provable here. Kept
  // as a regression guard on the underlying invariant (a mutually-unconfirmed
  // pair is never teamed), which is still worth a dedicated case: ISSUE-15's
  // pre-existing partner-requests flow can produce exactly this shape
  // (A requests X, X requests A back) without going through an email invite.
  it('a mutually linked but unconfirmed pair is not teamed', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const { e, f } = await confirmedPair(tournamentId)
    const a = await PlayerFactory.create(pool)
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(a.id, tournamentId)
    await playerRepo.createRegistration(x.id, tournamentId)

    // Craft a mutual, unconfirmed link directly.
    const aReg = (await playerRepo.findRegistration(a.id, tournamentId))!
    const xReg = (await playerRepo.findRegistration(x.id, tournamentId))!
    await pool.query(
      `UPDATE public.player_registrations SET partner_id = $1, status = 'registered', partner_confirmed = false WHERE id = $2`,
      [x.id, aReg.id]
    )
    await pool.query(
      `UPDATE public.player_registrations SET partner_id = $1, status = 'registered', partner_confirmed = false WHERE id = $2`,
      [a.id, xReg.id]
    )

    const groupsRes = await createGroups(tournamentId, orgToken, false)
    expect(groupsRes.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    expect(teams).toHaveLength(1)
    expect(hasTeam(teams, e.id, f.id)).toBe(true)
    expect(hasTeam(teams, a.id, x.id)).toBe(false)
  })

  // (c) — swept players land in the leftover pool and are auto-paired.
  it('swept players are auto-paired like any other leftover when pairUnpaired defaults on', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const c = await PlayerFactory.create(pool)
    const d = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(c.id, tournamentId)
    await playerRepo.createRegistration(d.id, tournamentId)
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournamentId)
    const a = await inviteExisting(tournamentId, x.email)

    const groupsRes = await createGroups(tournamentId, orgToken, true)
    expect(groupsRes.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    expect(teams).toHaveLength(2)
    const teamedPlayers = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    for (const p of [a.id, x.id, c.id, d.id]) {
      expect(teamedPlayers.has(p)).toBe(true)
    }

    const aRegAfter = (await playerRepo.findRegistration(a.id, tournamentId))!
    const xRegAfter = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect(aRegAfter.partner_confirmed).toBe(false)
    expect(xRegAfter.partner_confirmed).toBe(false)
  })

  // (d) — the sweep must not touch confirmed claims.
  it('a confirmed team formed earlier survives the sweep untouched', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const { e, f } = await confirmedPair(tournamentId)
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournamentId)
    const a = await inviteExisting(tournamentId, x.email)

    const groupsRes = await createGroups(tournamentId, orgToken, true)
    expect(groupsRes.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    expect(hasTeam(teams, e.id, f.id)).toBe(true)
    // The only two leftovers (A, X) are shuffled together deterministically —
    // there is nobody else for either of them to pair with.
    expect(hasTeam(teams, a.id, x.id)).toBe(true)

    const eRegAfter = (await playerRepo.findRegistration(e.id, tournamentId))!
    expect(eRegAfter.partner_confirmed).toBe(true)
    expect(eRegAfter.partner_id).toBe(f.id)
  })

  // (e) — the deadline exception (ISSUE-15 sub-decision 3) still works right
  // up until group creation; the sweep must not fire before then.
  it('X can still confirm an invite after registration closes, before group creation', async () => {
    const { tournamentId } = await openDoublesTournament()
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournamentId)
    const a = await inviteExisting(tournamentId, x.email)

    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')

    const aReg = (await playerRepo.findRegistration(a.id, tournamentId))!
    const confirm = await request(app)
      .patch(`/tournaments/registrations/${aReg.id}/confirm`)
      .set('Authorization', `Bearer ${await session(x.id, tournamentId)}`)
    expect(confirm.status).toBe(200)

    const aRegAfter = (await playerRepo.findRegistration(a.id, tournamentId))!
    const xRegAfter = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect(aRegAfter.partner_confirmed).toBe(true)
    expect(xRegAfter.partner_confirmed).toBe(true)
  })

  // (f) — an aborted group creation rolls the sweep back with everything else.
  it('a group-creation abort rolls back the sweep along with everything else', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const c = await PlayerFactory.create(pool)
    const d = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(c.id, tournamentId)
    await playerRepo.createRegistration(d.id, tournamentId)
    const x = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(x.id, tournamentId)
    const a = await inviteExisting(tournamentId, x.email)

    // No confirmed pairs exist and pairUnpaired is false, so zero teams form
    // — createGroupsForDoubles throws deep inside its own transaction
    // (`teamIds.length < numGroups`), well after the sweep has run.
    const groupsRes = await createGroups(tournamentId, orgToken, false)
    expect(groupsRes.status).toBeGreaterThanOrEqual(400)

    // ISSUE-16: an invite writes only the requester's own row — A's claim
    // on X is what the rollback must restore; X's row was never touched by
    // the invite in the first place, so it stays a plain solo throughout.
    const aRegAfter = (await playerRepo.findRegistration(a.id, tournamentId))!
    const xRegAfter = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect(aRegAfter.status).toBe('registered')
    expect(aRegAfter.partner_id).toBe(x.id)
    expect(xRegAfter.status).toBe('registered')
    expect(xRegAfter.partner_id).toBeNull()
  })
})
