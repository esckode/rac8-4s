/**
 * ISSUE-20 — Withdrawal never dissolves a team, and no query filters
 * withdrawn registrations.
 *
 * withdrawRegistration wrote only status + withdrawal_requested_at, never
 * touching partner_id/partner_confirmed on either row — so a confirmed
 * team's other half stayed "on a team" with someone who had left, and
 * couldn't invite anyone new because ISSUE-16/18's guards see a confirmed
 * partner. Separately, countRegistrationsForTournament and the group-
 * creation player query never looked at status at all, so withdrawn
 * players held capacity forever and could still be auto-paired into the
 * bracket.
 *
 * Fix: withdrawRegistration wraps the dissolve in a transaction and clears
 * partner_id/partner_confirmed on both rows (only for status='withdrawn',
 * not 'withdrawal_pending'), notifying the freed partner inline. Two named
 * predicates (registration-status.ts) — COUNTS_FOR_CAPACITY excludes only
 * withdrawn; PLAYS_IN_BRACKET excludes withdrawn and withdrawal_pending —
 * are wired into countRegistrationsForTournament and the group-creation
 * player query respectively.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, TournamentFactory, PlayerFactory } from '../factories'
import { PlayerRepository, TournamentRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { clearRateLimitStore } from '../../middleware/rate-limit'

describe('ISSUE-20 — withdrawal dissolves a confirmed team; capacity/bracket predicates', () => {
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

  async function openDoublesTournament(overrides: Record<string, unknown> = {}) {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, orgId, { matchFormat: 'doubles', ...overrides })
    return { tournamentId: tournament!.id, orgToken, orgId }
  }

  /** Registers e/f solo, then confirms a mutual team between them. */
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

  async function withdraw(tournamentId: string, playerId: string, registrationId: string) {
    return request(app)
      .delete(`/tournaments/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${await session(playerId, tournamentId)}`)
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
  it('X withdraws from a confirmed team → both rows cleared, A is a plain solo, A is notified', async () => {
    const { tournamentId } = await openDoublesTournament()
    const { e: a, f: x } = await confirmedPair(tournamentId)
    const xReg = (await playerRepo.findRegistration(x.id, tournamentId))!

    const res = await withdraw(tournamentId, x.id, xReg.id)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('withdrawn')

    const xAfter = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect(xAfter.status).toBe('withdrawn')
    expect(xAfter.partner_id).toBeNull()
    expect(xAfter.partner_confirmed).toBe(false)

    const aAfter = (await playerRepo.findRegistration(a.id, tournamentId))!
    expect(aAfter.status).toBe('registered')
    expect(aAfter.partner_id).toBeNull()
    expect(aAfter.partner_confirmed).toBe(false)

    const aNotifs = await personalNotifications(a.id)
    expect(aNotifs.some(n => n.body.includes(x.name))).toBe(true)
  })

  // (b)
  it('a post-deadline withdrawal request leaves the confirmed team intact', async () => {
    const { tournamentId } = await openDoublesTournament({
      registrationDeadline: new Date(Date.now() - 1000).toISOString(),
    })
    const { e: a, f: x } = await confirmedPair(tournamentId)
    const xReg = (await playerRepo.findRegistration(x.id, tournamentId))!

    const res = await withdraw(tournamentId, x.id, xReg.id)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('withdrawal_pending')

    const xAfter = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect(xAfter.status).toBe('withdrawal_pending')
    expect(xAfter.partner_id).toBe(a.id)
    expect(xAfter.partner_confirmed).toBe(true)

    const aAfter = (await playerRepo.findRegistration(a.id, tournamentId))!
    expect(aAfter.partner_id).toBe(x.id)
    expect(aAfter.partner_confirmed).toBe(true)
  })

  // (c)
  it('a withdrawn registration does not count toward capacity', async () => {
    const { tournamentId } = await openDoublesTournament()
    const p = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(p.id, tournamentId)
    const reg = (await playerRepo.findRegistration(p.id, tournamentId))!

    const before = await playerRepo.countRegistrationsForTournament(tournamentId)
    const res = await withdraw(tournamentId, p.id, reg.id)
    expect(res.status).toBe(200)

    const after = await playerRepo.countRegistrationsForTournament(tournamentId)
    expect(after).toBe(before - 1)
  })

  // (d)
  it('a withdrawal_pending registration still counts toward capacity', async () => {
    const { tournamentId } = await openDoublesTournament({
      registrationDeadline: new Date(Date.now() - 1000).toISOString(),
    })
    const p = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(p.id, tournamentId)
    const reg = (await playerRepo.findRegistration(p.id, tournamentId))!

    const before = await playerRepo.countRegistrationsForTournament(tournamentId)
    const res = await withdraw(tournamentId, p.id, reg.id)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('withdrawal_pending')

    const after = await playerRepo.countRegistrationsForTournament(tournamentId)
    expect(after).toBe(before)
  })

  // (e)
  it('withdrawn and withdrawal_pending registrations are excluded from the group-creation player list', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const { e, f } = await confirmedPair(tournamentId)
    const g = await PlayerFactory.create(pool)
    const h = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(g.id, tournamentId)
    await playerRepo.createRegistration(h.id, tournamentId)
    const withdrawnPlayer = await PlayerFactory.create(pool)
    const pendingPlayer = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(withdrawnPlayer.id, tournamentId)
    await playerRepo.createRegistration(pendingPlayer.id, tournamentId)
    await pool.query(
      `UPDATE public.player_registrations SET status = 'withdrawn' WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, withdrawnPlayer.id]
    )
    await pool.query(
      `UPDATE public.player_registrations SET status = 'withdrawal_pending' WHERE tournament_id = $1 AND player_id = $2`,
      [tournamentId, pendingPlayer.id]
    )

    await tournamentRepo.updateStatus(tournamentId, 'registration_closed')
    const groupsRes = await request(app)
      .post(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 1, advancingPerGroup: 1 })
    expect(groupsRes.status).toBe(201)

    const teamsResult = await pool.query(
      `SELECT player1_id, player2_id FROM public.teams WHERE tournament_id = $1`,
      [tournamentId]
    )
    const teamedPlayers = new Set(
      (teamsResult.rows as { player1_id: string; player2_id: string }[]).flatMap(t => [t.player1_id, t.player2_id])
    )
    for (const p of [e.id, f.id, g.id, h.id]) {
      expect(teamedPlayers.has(p)).toBe(true)
    }
    expect(teamedPlayers.has(withdrawnPlayer.id)).toBe(false)
    expect(teamedPlayers.has(pendingPlayer.id)).toBe(false)

    // Untouched by group creation — never entered the leftover pool at all.
    const withdrawnAfter = await playerRepo.findRegistration(withdrawnPlayer.id, tournamentId)
    const pendingAfter = await playerRepo.findRegistration(pendingPlayer.id, tournamentId)
    expect(withdrawnAfter?.status).toBe('withdrawn')
    expect(pendingAfter?.status).toBe('withdrawal_pending')
  })

  // (f)
  it('A, freed by a dissolved team, can immediately invite someone else', async () => {
    const { tournamentId } = await openDoublesTournament()
    const { e: a, f: x } = await confirmedPair(tournamentId)
    const xReg = (await playerRepo.findRegistration(x.id, tournamentId))!
    expect((await withdraw(tournamentId, x.id, xReg.id)).status).toBe(200)

    const c = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(c.id, tournamentId)

    const requestPartner = await request(app)
      .post(`/tournaments/${tournamentId}/partner-requests`)
      .set('Authorization', `Bearer ${await session(a.id, tournamentId)}`)
      .send({ targetPlayerId: c.id })
    expect(requestPartner.status).toBe(201)
  })
})
