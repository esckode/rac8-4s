/**
 * G4.4 — Durable cross-tournament leaderboards (RED tests).
 *
 * Tests under this suite:
 *   1. Match log written on casual score submission (group-linked tournament)
 *   2. Match log NOT written for scheduled tournaments (regression)
 *   3. Contract: anonymizeMatchLogSlotsFor nulls player_id, leaves name_snapshot intact
 *   4. Contract: recomputeLeaderboards after anonymization excludes the erased player
 *   5. Individual leaderboard endpoint (GET /player/groups/:groupId/leaderboard/individual)
 *   6. Pair leaderboard endpoint (GET /player/groups/:groupId/leaderboard/pairs)
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, OrganizerFactory } from '../factories'
import { PlayerRepository, GroupRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { LeaderboardRepository } from '../../repositories/leaderboard-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Insert a casual tournament linked to a player_group. */
async function createCasualGroupTournament(
  pool: Pool,
  organizerId: string,
  groupId: string
): Promise<string> {
  const name = `casual-lb-${uid()}`
  const id = `tournament_${Date.now()}_${uid()}`
  const now = new Date().toISOString()
  await pool.query(
    `INSERT INTO public.tournaments
       (id, name, sport, match_format, creator_id, status,
        max_players, mode, visibility, group_id,
        registration_deadline, group_stage_deadline, knockout_stage_deadline,
        created_at, updated_at)
     VALUES ($1, $2, 'tennis', 'singles', $3, 'group_stage_active',
             8, 'casual', 'unlisted', $4,
             NULL, NULL, NULL,
             $5, $5)`,
    [id, name, organizerId, groupId, now]
  )
  return id
}

/** Insert a scheduled tournament (no group_id). */
async function createScheduledTournament(pool: Pool, organizerId: string): Promise<string> {
  const name = `scheduled-lb-${uid()}`
  const id = `tournament_${Date.now()}_${uid()}`
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const future2 = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString()
  const future3 = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString()
  await pool.query(
    `INSERT INTO public.tournaments
       (id, name, sport, match_format, creator_id, status,
        max_players, mode, visibility,
        registration_deadline, group_stage_deadline, knockout_stage_deadline,
        created_at, updated_at)
     VALUES ($1, $2, 'tennis', 'singles', $3, 'group_stage_active',
             8, 'scheduled', 'public',
             $4, $5, $6,
             $7, $7)`,
    [id, name, organizerId, future, future2, future3, now]
  )
  return id
}

/** Register a player directly and return their session token. */
async function registerAndGetToken(
  pool: Pool,
  tokenStore: InMemoryTokenStore,
  tournamentId: string
): Promise<{ playerId: string; playerName: string; sessionToken: string }> {
  const player = await PlayerFactory.create(pool)
  const playerRepo = new PlayerRepository(pool)
  await playerRepo.createRegistration(player.id, tournamentId)
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId, email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return { playerId: player.id, playerName: player.name, sessionToken: session.token }
}

/** Create a player_group and return its id. */
async function createPlayerGroup(pool: Pool, ownerPlayerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by)
     VALUES ($1, $2)
     RETURNING id`,
    [`group-lb-${uid()}`, ownerPlayerId]
  )
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'owner')`,
    [res.rows[0].id, ownerPlayerId]
  )
  return res.rows[0].id
}

// ─────────────────────────────────────────────────────────────────────────────

describe('G4.4 durable cross-tournament leaderboards', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let organizerId: string

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool) as any
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    const org = OrganizerFactory.token(jwtConfig)
    organizerId = org.sub
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // ─── Test 1: match log written for casual group-linked tournament ─────────

  describe('1. match log written on casual score submission', () => {
    it('writes one group_match_log row and participant slots after a casual group match is scored', async () => {
      // Setup: group → tournament → players → match
      const { id: owner } = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner)
      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)

      const { playerId: p1, sessionToken: tok1 } = await registerAndGetToken(pool, tokenStore, tournamentId)
      const { playerId: p2 } = await registerAndGetToken(pool, tokenStore, tournamentId)

      const groupRepo = new GroupRepository(pool)
      const groups = await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2])
      const matches = await groupRepo.findMatchesByGroup(groups[0].id)
      expect(matches.length).toBeGreaterThan(0)

      const match = matches[0]
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${tok1}`)
        .send({ score: '6-4, 6-3' })
      expect(res.status).toBe(200)

      // Verify match log row
      const logRows = await pool.query(
        `SELECT * FROM public.group_match_log WHERE match_ref = $1`,
        [match.id]
      )
      expect(logRows.rows).toHaveLength(1)
      expect(logRows.rows[0].tournament_id).toBe(tournamentId)
      expect(logRows.rows[0].group_id).toBe(groupId)
      expect(['team1', 'team2']).toContain(logRows.rows[0].winning_side)

      // Verify participant slots
      const slots = await pool.query(
        `SELECT * FROM public.group_match_participants WHERE match_log_id = $1 ORDER BY slot`,
        [logRows.rows[0].id]
      )
      expect(slots.rows).toHaveLength(2)
      const playerIds = slots.rows.map((r: any) => r.player_id)
      expect(playerIds).toContain(p1)
      expect(playerIds).toContain(p2)
      // name_snapshot must be non-empty
      slots.rows.forEach((r: any) => {
        expect(r.name_snapshot).toBeTruthy()
      })
    })

    it('is idempotent — re-submitting the same match_ref does not duplicate the log row', async () => {
      // Insert a log row directly then call logMatch again with the same match_ref
      const { id: owner } = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner)
      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const { playerId: p1 } = await registerAndGetToken(pool, tokenStore, tournamentId)
      const { playerId: p2 } = await registerAndGetToken(pool, tokenStore, tournamentId)

      const lbRepo = new LeaderboardRepository(pool)
      const matchRef = `match-ref-${uid()}`

      await lbRepo.logMatch(tournamentId, groupId, matchRef, 'team1', [
        { playerId: p1, nameSnapshot: 'P1', side: 'team1' },
        { playerId: p2, nameSnapshot: 'P2', side: 'team2' },
      ])
      await lbRepo.logMatch(tournamentId, groupId, matchRef, 'team1', [
        { playerId: p1, nameSnapshot: 'P1', side: 'team1' },
        { playerId: p2, nameSnapshot: 'P2', side: 'team2' },
      ])

      const logRows = await pool.query(
        `SELECT * FROM public.group_match_log WHERE match_ref = $1`,
        [matchRef]
      )
      expect(logRows.rows).toHaveLength(1)
    })
  })

  // ─── Test 2: match log NOT written for scheduled tournaments ─────────────

  describe('2. match log NOT written for scheduled tournaments', () => {
    it('does not create a group_match_log row when a scheduled tournament match is scored', async () => {
      const tournamentId = await createScheduledTournament(pool, organizerId)

      const { playerId: p1, sessionToken: tok1 } = await registerAndGetToken(pool, tokenStore, tournamentId)
      const { playerId: p2 } = await registerAndGetToken(pool, tokenStore, tournamentId)

      const groupRepo = new GroupRepository(pool)
      const groups = await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2])
      const matches = await groupRepo.findMatchesByGroup(groups[0].id)
      expect(matches.length).toBeGreaterThan(0)

      const match = matches[0]
      const res = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${tok1}`)
        .send({ score: '6-4, 6-3' })
      expect(res.status).toBe(200)

      const logRows = await pool.query(
        `SELECT * FROM public.group_match_log WHERE match_ref = $1`,
        [match.id]
      )
      expect(logRows.rows).toHaveLength(0)
    })
  })

  // ─── Test 3: anonymizeMatchLogSlotsFor ───────────────────────────────────

  describe('3. anonymizeMatchLogSlotsFor', () => {
    it('nulls player_id for erased player; leaves other slots and name_snapshot intact', async () => {
      const { id: owner } = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner)
      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const { playerId: p1 } = await registerAndGetToken(pool, tokenStore, tournamentId)
      const { playerId: p2 } = await registerAndGetToken(pool, tokenStore, tournamentId)

      const lbRepo = new LeaderboardRepository(pool)
      const matchRef = `match-anon-${uid()}`

      await lbRepo.logMatch(tournamentId, groupId, matchRef, 'team1', [
        { playerId: p1, nameSnapshot: 'Alice', side: 'team1' },
        { playerId: p2, nameSnapshot: 'Bob', side: 'team2' },
      ])

      await lbRepo.anonymizeMatchLogSlotsFor(p1)

      const logRow = await pool.query(
        `SELECT id FROM public.group_match_log WHERE match_ref = $1`,
        [matchRef]
      )
      const matchLogId = logRow.rows[0].id

      const slots = await pool.query(
        `SELECT * FROM public.group_match_participants WHERE match_log_id = $1 ORDER BY slot`,
        [matchLogId]
      )

      const aliceSlot = slots.rows.find((r: any) => r.name_snapshot === 'Alice')
      const bobSlot = slots.rows.find((r: any) => r.name_snapshot === 'Bob')

      expect(aliceSlot).toBeDefined()
      expect(aliceSlot.player_id).toBeNull()
      expect(aliceSlot.name_snapshot).toBe('Alice') // snapshot intact

      expect(bobSlot).toBeDefined()
      expect(bobSlot.player_id).toBe(p2) // untouched
      expect(bobSlot.name_snapshot).toBe('Bob')
    })

    it('is idempotent — calling twice does not error', async () => {
      const { id: owner } = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner)
      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const { playerId: p1 } = await registerAndGetToken(pool, tokenStore, tournamentId)

      const lbRepo = new LeaderboardRepository(pool)
      const matchRef = `match-anon-idem-${uid()}`

      await lbRepo.logMatch(tournamentId, groupId, matchRef, 'team1', [
        { playerId: p1, nameSnapshot: 'Alice', side: 'team1' },
      ])

      await expect(lbRepo.anonymizeMatchLogSlotsFor(p1)).resolves.not.toThrow()
      await expect(lbRepo.anonymizeMatchLogSlotsFor(p1)).resolves.not.toThrow()
    })
  })

  // ─── Test 4: recomputeLeaderboards after anonymization ───────────────────

  describe('4. recomputeLeaderboards after anonymization', () => {
    it('excludes anonymized player from individual results; non-anonymized player still appears', async () => {
      const { id: owner } = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner)
      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const { playerId: p1 } = await registerAndGetToken(pool, tokenStore, tournamentId)
      const { playerId: p2 } = await registerAndGetToken(pool, tokenStore, tournamentId)

      const lbRepo = new LeaderboardRepository(pool)

      // Log two matches: p1 wins both against p2
      await lbRepo.logMatch(tournamentId, groupId, `mr-anon-a-${uid()}`, 'team1', [
        { playerId: p1, nameSnapshot: 'Erased', side: 'team1' },
        { playerId: p2, nameSnapshot: 'Bob', side: 'team2' },
      ])
      await lbRepo.logMatch(tournamentId, groupId, `mr-anon-b-${uid()}`, 'team1', [
        { playerId: p1, nameSnapshot: 'Erased', side: 'team1' },
        { playerId: p2, nameSnapshot: 'Bob', side: 'team2' },
      ])

      // Anonymize p1
      await lbRepo.anonymizeMatchLogSlotsFor(p1)

      const { individuals } = await lbRepo.recomputeLeaderboards(groupId)

      const p1Entry = individuals.find(r => r.playerId === p1)
      const p2Entry = individuals.find(r => r.playerId === p2)

      expect(p1Entry).toBeUndefined() // erased player excluded
      expect(p2Entry).toBeDefined()
      expect(p2Entry!.wins).toBe(0)
      expect(p2Entry!.losses).toBe(2)
    })
  })

  // ─── Test 5: individual leaderboard endpoint ─────────────────────────────

  describe('5. GET /player/groups/:groupId/leaderboard/individual', () => {
    it('returns sorted individual leaderboard for group members', async () => {
      const p1 = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, p1.id)
      const p2 = await PlayerFactory.create(pool)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [groupId, p2.id]
      )

      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const playerRepo = new PlayerRepository(pool)
      await playerRepo.createRegistration(p1.id, tournamentId)
      await playerRepo.createRegistration(p2.id, tournamentId)

      const lbRepo = new LeaderboardRepository(pool)
      // p1 wins 3 matches
      for (let i = 0; i < 3; i++) {
        await lbRepo.logMatch(tournamentId, groupId, `mr-ind-${uid()}`, 'team1', [
          { playerId: p1.id, nameSnapshot: p1.name, side: 'team1' },
          { playerId: p2.id, nameSnapshot: p2.name, side: 'team2' },
        ])
      }

      // Get a session for p1 (a member)
      const session = await generatePlayerSession(
        { playerId: p1.id, tournamentId, email: p1.email, createdAt: Date.now() },
        3600,
        tokenStore
      )

      const res = await request(app)
        .get(`/player/groups/${groupId}/leaderboard/individual`)
        .set('Authorization', `Bearer ${session.token}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('leaderboard')
      expect(Array.isArray(res.body.leaderboard)).toBe(true)

      const lb: Array<{ playerId: string; wins: number; losses: number }> = res.body.leaderboard
      const p1Row = lb.find(r => r.playerId === p1.id)
      const p2Row = lb.find(r => r.playerId === p2.id)
      expect(p1Row).toBeDefined()
      expect(p1Row!.wins).toBe(3)
      expect(p1Row!.losses).toBe(0)
      expect(p2Row).toBeDefined()
      expect(p2Row!.wins).toBe(0)
      expect(p2Row!.losses).toBe(3)
      // p1 (more wins) should appear before p2
      expect(lb.indexOf(p1Row!)).toBeLessThan(lb.indexOf(p2Row!))
    })

    it('returns 403 for non-members', async () => {
      const owner = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner.id)
      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)

      const nonMember = await PlayerFactory.create(pool)
      const session = await generatePlayerSession(
        { playerId: nonMember.id, tournamentId, email: nonMember.email, createdAt: Date.now() },
        3600,
        tokenStore
      )
      const res = await request(app)
        .get(`/player/groups/${groupId}/leaderboard/individual`)
        .set('Authorization', `Bearer ${session.token}`)
      expect(res.status).toBe(403)
    })

    it('returns 401 with no auth', async () => {
      const owner = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, owner.id)
      const res = await request(app)
        .get(`/player/groups/${groupId}/leaderboard/individual`)
      expect([401, 403]).toContain(res.status)
    })
  })

  // ─── Test 6: pair leaderboard endpoint ───────────────────────────────────

  describe('6. GET /player/groups/:groupId/leaderboard/pairs', () => {
    it('returns empty list for a group with only 1v1 singles matches (no pair sharing a side)', async () => {
      const p1 = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, p1.id)
      const p2 = await PlayerFactory.create(pool)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role)
         VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [groupId, p2.id]
      )

      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const lbRepo = new LeaderboardRepository(pool)
      // 1v1 singles: slot 0 = p1 (team1), slot 1 = p2 (team2). No two players share a side.
      await lbRepo.logMatch(tournamentId, groupId, `mr-pair-singles-${uid()}`, 'team1', [
        { playerId: p1.id, nameSnapshot: p1.name, side: 'team1' },
        { playerId: p2.id, nameSnapshot: p2.name, side: 'team2' },
      ])

      const session = await generatePlayerSession(
        { playerId: p1.id, tournamentId, email: p1.email, createdAt: Date.now() },
        3600,
        tokenStore
      )

      const res = await request(app)
        .get(`/player/groups/${groupId}/leaderboard/pairs`)
        .set('Authorization', `Bearer ${session.token}`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('leaderboard')
      expect(res.body.leaderboard).toHaveLength(0)
    })

    it('returns pair stats when two players share a doubles side', async () => {
      const p1 = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, p1.id)
      const p2 = await PlayerFactory.create(pool)
      const p3 = await PlayerFactory.create(pool)
      const p4 = await PlayerFactory.create(pool)
      for (const p of [p2, p3, p4]) {
        await pool.query(
          `INSERT INTO public.player_group_members (group_id, player_id, role)
           VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
          [groupId, p.id]
        )
      }

      const tournamentId = await createCasualGroupTournament(pool, organizerId, groupId)
      const lbRepo = new LeaderboardRepository(pool)

      // Doubles: p1+p2 vs p3+p4. p1 and p2 share team1 (side).
      await lbRepo.logMatch(tournamentId, groupId, `mr-pair-doubles-${uid()}`, 'team1', [
        { playerId: p1.id, nameSnapshot: p1.name, side: 'team1' },
        { playerId: p2.id, nameSnapshot: p2.name, side: 'team1' },
        { playerId: p3.id, nameSnapshot: p3.name, side: 'team2' },
        { playerId: p4.id, nameSnapshot: p4.name, side: 'team2' },
      ])

      const session = await generatePlayerSession(
        { playerId: p1.id, tournamentId, email: p1.email, createdAt: Date.now() },
        3600,
        tokenStore
      )

      const res = await request(app)
        .get(`/player/groups/${groupId}/leaderboard/pairs`)
        .set('Authorization', `Bearer ${session.token}`)
      expect(res.status).toBe(200)
      const lb: Array<{ playerA: string; playerB: string; wins: number; losses: number }> =
        res.body.leaderboard
      expect(lb.length).toBeGreaterThan(0)

      // p1+p2 won (team1 won)
      const winningPair = lb.find(
        r =>
          (r.playerA === p1.id && r.playerB === p2.id) ||
          (r.playerA === p2.id && r.playerB === p1.id)
      )
      expect(winningPair).toBeDefined()
      expect(winningPair!.wins).toBe(1)
      expect(winningPair!.losses).toBe(0)

      // p3+p4 lost
      const losingPair = lb.find(
        r =>
          (r.playerA === p3.id && r.playerB === p4.id) ||
          (r.playerA === p4.id && r.playerB === p3.id)
      )
      expect(losingPair).toBeDefined()
      expect(losingPair!.wins).toBe(0)
      expect(losingPair!.losses).toBe(1)
    })
  })
})
