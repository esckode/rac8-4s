/**
 * ISSUE-17 — Solo doubles registrants are auto-paired with a stranger
 * without consent.
 *
 * Owner decision: prospective consent, collected at registration (not at
 * pairing time — registration is closed by then, so declining would mean
 * exclusion with no path to find a partner). Auto-pairing itself is
 * retained; this issue owns the per-registration flag, its effect on group
 * creation, and the organizer's pre-close visibility. Team-formation
 * notifications themselves are ISSUE-19's; this issue only adds the
 * "left unpaired" case reachable by a player's own opt-out.
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
import { clearRateLimitStore } from '../../middleware/rate-limit'
import { processTeamsFormed } from '../../workers/teams-formed-processor'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('ISSUE-17 — per-registration auto-pair consent', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let playerRepo: PlayerRepository
  let tournamentRepo: TournamentRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, { config: { publicDiscoveryEnabled: true } })
    app = deps.app
    jwtConfig = deps.jwtConfig
    playerRepo = new PlayerRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  beforeEach(() => {
    clearRateLimitStore()
  })

  async function openDoublesTournament() {
    const { sub: orgId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const tournament = await TournamentFactory.open(pool, orgId, { matchFormat: 'doubles' })
    return { tournamentId: tournament!.id, orgToken, orgId }
  }

  /** Registers a fresh solo player via the public route. Omits autoPairConsent when undefined. */
  async function registerSolo(tournamentId: string, autoPairConsent?: boolean) {
    const email = `p-${uid()}@test.local`
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({
        email,
        name: `Player ${uid()}`,
        dob_attestation: defaultAdultAttestation(),
        ...(autoPairConsent === undefined ? {} : { autoPairConsent }),
      })
    if (res.status !== 202) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`)
    const player = await playerRepo.findByEmail(email)
    return player!
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

  async function personalNotifications(playerId: string) {
    const result = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.type = 'personal' AND c.player_id = $1`,
      [playerId]
    )
    return result.rows as { body: string }[]
  }

  // (a)
  it('(a) a registration with consent off is marked unpaired and never teamed', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const optedOut = await registerSolo(tournamentId, false)
    await registerSolo(tournamentId)
    await registerSolo(tournamentId)
    await registerSolo(tournamentId)

    const res = await createGroups(tournamentId, orgToken, true)
    expect(res.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    const teamedPlayers = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    expect(teamedPlayers.has(optedOut.id)).toBe(false)

    const reg = await playerRepo.findRegistration(optedOut.id, tournamentId)
    expect(reg?.status).toBe('unpaired')
  })

  // (b)
  it('(b) consent on behaves exactly as today — all four auto-paired into two teams', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const p1 = await registerSolo(tournamentId, true)
    const p2 = await registerSolo(tournamentId, true)
    const p3 = await registerSolo(tournamentId, true)
    const p4 = await registerSolo(tournamentId, true)

    const res = await createGroups(tournamentId, orgToken, true)
    expect(res.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    expect(teams).toHaveLength(2)
    const teamedPlayers = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    for (const p of [p1, p2, p3, p4]) {
      expect(teamedPlayers.has(p.id)).toBe(true)
    }
  })

  // (c)
  it('(c) the default is on when the field is absent — existing clients unaffected', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const p1 = await registerSolo(tournamentId) // autoPairConsent omitted
    const p2 = await registerSolo(tournamentId)
    const p3 = await registerSolo(tournamentId)
    const p4 = await registerSolo(tournamentId)

    const regBefore = await playerRepo.findRegistration(p1.id, tournamentId)
    expect(regBefore?.auto_pair_consent).toBe(true)

    const res = await createGroups(tournamentId, orgToken, true)
    expect(res.status).toBe(201)

    const teams = await teamsFor(tournamentId)
    const teamedPlayers = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    for (const p of [p1, p2, p3, p4]) {
      expect(teamedPlayers.has(p.id)).toBe(true)
    }
  })

  // (d)
  it('(d) a player the flag excludes is notified that they were left unpaired', async () => {
    const { tournamentId, orgToken } = await openDoublesTournament()
    const optedOut = await registerSolo(tournamentId, false)
    await registerSolo(tournamentId)
    await registerSolo(tournamentId)
    await registerSolo(tournamentId)

    const res = await createGroups(tournamentId, orgToken, true)
    expect(res.status).toBe(201)

    await processTeamsFormed({ tournamentId }, { pool })

    const notifs = await personalNotifications(optedOut.id)
    expect(notifs.length).toBeGreaterThan(0)
  })

  // (e)
  describe('organizer pairing preview', () => {
    async function preview(tournamentId: string, orgToken: string, pairUnpaired = true) {
      return request(app)
        .get(`/tournaments/${tournamentId}/pairing-preview?pairUnpaired=${pairUnpaired}`)
        .set('Authorization', `Bearer ${orgToken}`)
    }

    it('3 leftovers with 1 opted out → unpairedCount 1', async () => {
      const { tournamentId, orgToken } = await openDoublesTournament()
      await registerSolo(tournamentId, false)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)

      const res = await preview(tournamentId, orgToken)
      expect(res.status).toBe(200)
      expect(res.body.unpairedCount).toBe(1)
      expect(res.body.optedOut).toHaveLength(1)
    })

    it('4 leftovers with 0 opted out → unpairedCount 0', async () => {
      const { tournamentId, orgToken } = await openDoublesTournament()
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)

      const res = await preview(tournamentId, orgToken)
      expect(res.status).toBe(200)
      expect(res.body.unpairedCount).toBe(0)
      expect(res.body.optedOut).toHaveLength(0)
    })

    it('4 leftovers with 1 opted out → unpairedCount 2 (the parity trap)', async () => {
      const { tournamentId, orgToken } = await openDoublesTournament()
      await registerSolo(tournamentId, false)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)

      const res = await preview(tournamentId, orgToken)
      expect(res.status).toBe(200)
      // 3 consenting leftovers is odd — the opted-out player PLUS the odd
      // one out among consenting leftovers, not just leftovers % 2 over
      // all 4 (which would wrongly say 0).
      expect(res.body.unpairedCount).toBe(2)
      expect(res.body.optedOut).toHaveLength(1)
    })

    it('pairUnpaired=false → every leftover is unpaired', async () => {
      const { tournamentId, orgToken } = await openDoublesTournament()
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)
      await registerSolo(tournamentId)

      const res = await preview(tournamentId, orgToken, false)
      expect(res.status).toBe(200)
      expect(res.body.unpairedCount).toBe(4)
    })

    it('does not share code with group creation — a confirmed team is excluded from the leftover count', async () => {
      const { tournamentId, orgToken } = await openDoublesTournament()
      const e = await PlayerFactory.create(pool)
      const f = await PlayerFactory.create(pool)
      await playerRepo.createRegistration(e.id, tournamentId)
      await playerRepo.createRegistration(f.id, tournamentId)
      const eReg = (await playerRepo.findRegistration(e.id, tournamentId))!
      await playerRepo.updateRegistrationWithPartner(eReg.id, f.id)
      await playerRepo.confirmPartner(eReg.id)
      await registerSolo(tournamentId, false)

      const res = await preview(tournamentId, orgToken)
      expect(res.status).toBe(200)
      // Only the one opted-out solo is a leftover; the confirmed pair (e, f)
      // is excluded entirely.
      expect(res.body.unpairedCount).toBe(1)
      expect(res.body.optedOut).toHaveLength(1)
    })
  })
})
