/**
 * G4.6 — End-session route + idle auto-archive sweep
 *
 * RED tests: written FIRST; will fail until the route and sweep function are implemented.
 *
 * Features under test:
 *   1. All matches scored → POST /end-session returns 200, status = 'completed'
 *   2. Partial matches → POST /end-session returns 200, status = 'abandoned'
 *   3. System message posted when tournament has a group_id
 *   4. Already terminal tournament → 409
 *   5. Non-casual tournament → 400
 *   6. Idle sweep: backdated tournament is swept to 'abandoned'
 *   7. Sweep skips non-idle (recently updated) tournaments
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'
import { InMemoryTokenStore } from '../../auth/token-store'
import { sweepIdleCasualTournaments } from '../../casual-idle-sweep'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Insert a casual tournament directly. Returns tournament id. */
async function createCasualTournament(pool: Pool, organizerId: string): Promise<string> {
  const name = `casual-${uid()}`
  const id = `tournament_${Date.now()}_${uid()}`
  const now = new Date().toISOString()
  await pool.query(
    `INSERT INTO public.tournaments
       (id, name, sport, match_format, creator_id, status,
        max_players, mode, visibility,
        registration_deadline, group_stage_deadline, knockout_stage_deadline,
        created_at, updated_at)
     VALUES ($1, $2, 'tennis', 'singles', $3, 'registration_closed',
             8, 'casual', 'unlisted',
             NULL, NULL, NULL,
             $4, $4)`,
    [id, name, organizerId, now]
  )
  return id
}

/** Insert a scheduled (non-casual) tournament. Returns tournament id. */
async function createScheduledTournament(pool: Pool, organizerId: string): Promise<string> {
  const name = `scheduled-${uid()}`
  const id = `tournament_${Date.now()}_${uid()}`
  const now = new Date().toISOString()
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  await pool.query(
    `INSERT INTO public.tournaments
       (id, name, sport, match_format, creator_id, status,
        max_players, mode, visibility,
        registration_deadline, group_stage_deadline, knockout_stage_deadline,
        created_at, updated_at)
     VALUES ($1, $2, 'tennis', 'singles', $3, 'group_stage_active',
             8, 'scheduled', 'public',
             $4, $4, $4,
             $5, $5)`,
    [id, name, organizerId, future, now]
  )
  return id
}

/** Create a player_group and return its UUID. */
async function createPlayerGroup(pool: Pool, creatorId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by, default_match_format)
     VALUES ($1, $2, 'singles') RETURNING id`,
    [`group-${uid()}`, creatorId]
  )
  return res.rows[0].id as string
}

/** Link a tournament to a player_group. */
async function linkGroupToTournament(pool: Pool, tournamentId: string, groupId: string): Promise<void> {
  await pool.query(
    `UPDATE public.tournaments SET group_id = $1 WHERE id = $2`,
    [groupId, tournamentId]
  )
}

/** Create a group conversation for a player_group. Returns conversation id. */
async function ensureGroupConversation(pool: Pool, groupId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO messaging.conversations (type, group_id)
     VALUES ('group', $1)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [groupId]
  )
  if (res.rows.length > 0) return res.rows[0].id as string
  const sel = await pool.query(
    `SELECT id FROM messaging.conversations WHERE group_id = $1 LIMIT 1`,
    [groupId]
  )
  return sel.rows[0].id as string
}

/** Register a player directly. Returns playerId. */
async function registerPlayer(pool: Pool, tournamentId: string): Promise<string> {
  const player = await PlayerFactory.create(pool)
  const playerRepo = new PlayerRepository(pool)
  await playerRepo.createRegistration(player.id, tournamentId)
  return player.id
}

describe('G4.6 end-session route and idle auto-archive sweep', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let tokenStore: InMemoryTokenStore
  let organizerId: string
  let orgToken: string

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool) as any
    app = deps.app
    jwtConfig = deps.jwtConfig
    tokenStore = deps.tokenStore
    const org = OrganizerFactory.token(jwtConfig)
    organizerId = org.sub
    orgToken = org.accessToken
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // ── 1. All matches scored → completed ────────────────────────────────────

  it('1. POST /end-session when all matches scored → 200 + status completed', async () => {
    const tournamentId = await createCasualTournament(pool, organizerId)
    const p1 = await registerPlayer(pool, tournamentId)
    const p2 = await registerPlayer(pool, tournamentId)

    const groupRepo = new GroupRepository(pool)
    const repo = new TournamentRepository(pool)

    await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2])
    await repo.updateStatus(tournamentId, 'group_stage_active')

    // Mark all group_matches as completed
    await pool.query(
      `UPDATE public.group_matches SET status = 'completed', updated_at = now()
       WHERE tournament_id = $1`,
      [tournamentId]
    )

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/end-session`)
      .set('Authorization', `Bearer ${orgToken}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
    expect(res.body.endedAt).toBeDefined()

    const t = await repo.findById(tournamentId)
    expect(t!.status).toBe('completed')
  })

  // ── 2. Partial matches → abandoned ───────────────────────────────────────

  it('2. POST /end-session with partial matches → 200 + status abandoned', async () => {
    const tournamentId = await createCasualTournament(pool, organizerId)
    const p1 = await registerPlayer(pool, tournamentId)
    const p2 = await registerPlayer(pool, tournamentId)
    const p3 = await registerPlayer(pool, tournamentId)

    const groupRepo = new GroupRepository(pool)
    const repo = new TournamentRepository(pool)

    // 3 players → 3 matches (round-robin); leave them all pending
    await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2, p3])
    await repo.updateStatus(tournamentId, 'group_stage_active')

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/end-session`)
      .set('Authorization', `Bearer ${orgToken}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('abandoned')
    expect(res.body.endedAt).toBeDefined()

    const t = await repo.findById(tournamentId)
    expect(t!.status).toBe('abandoned')
  })

  // ── 3. System message posted in group conversation ────────────────────────

  it('3. POST /end-session posts system message when tournament has group_id', async () => {
    const tournamentId = await createCasualTournament(pool, organizerId)
    const p1 = await registerPlayer(pool, tournamentId)
    const p2 = await registerPlayer(pool, tournamentId)

    const groupRepo = new GroupRepository(pool)
    const repo = new TournamentRepository(pool)

    await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2])
    await repo.updateStatus(tournamentId, 'group_stage_active')

    // Mark matches completed
    await pool.query(
      `UPDATE public.group_matches SET status = 'completed', updated_at = now()
       WHERE tournament_id = $1`,
      [tournamentId]
    )

    // Create a player_group and link it; also create the conversation
    const groupId = await createPlayerGroup(pool, p1)
    await linkGroupToTournament(pool, tournamentId, groupId)
    await pool.query(
      `INSERT INTO messaging.conversations (type, group_id) VALUES ('group', $1)
       ON CONFLICT DO NOTHING`,
      [groupId]
    )

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/end-session`)
      .set('Authorization', `Bearer ${orgToken}`)

    expect(res.status).toBe(200)

    // Verify a system message was posted
    const msgRes = await pool.query(
      `SELECT gm.body, gm.type, gm.sender_name_snapshot
       FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'system'
       ORDER BY gm.created_at DESC
       LIMIT 1`,
      [groupId]
    )
    expect(msgRes.rows.length).toBe(1)
    expect(msgRes.rows[0].sender_name_snapshot).toBe('system')
    expect(msgRes.rows[0].body).toMatch(/Session ended/)
  })

  // ── 4. Already terminal → 409 ────────────────────────────────────────────

  it('4. POST /end-session on already-terminal tournament → 409', async () => {
    const tournamentId = await createCasualTournament(pool, organizerId)
    const repo = new TournamentRepository(pool)
    await repo.updateStatus(tournamentId, 'abandoned')

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/end-session`)
      .set('Authorization', `Bearer ${orgToken}`)

    expect(res.status).toBe(409)
  })

  // ── 5. Non-casual → 400 ──────────────────────────────────────────────────

  it('5. POST /end-session on non-casual (scheduled) tournament → 400', async () => {
    const tournamentId = await createScheduledTournament(pool, organizerId)

    const res = await request(app)
      .post(`/tournaments/${tournamentId}/end-session`)
      .set('Authorization', `Bearer ${orgToken}`)

    expect(res.status).toBe(400)
  })

  // ── 6. Idle sweep: backdated tournament is swept ──────────────────────────

  it('6. sweepIdleCasualTournaments archives idle casual tournaments', async () => {
    const tournamentId = await createCasualTournament(pool, organizerId)
    const p1 = await registerPlayer(pool, tournamentId)
    const p2 = await registerPlayer(pool, tournamentId)

    const groupRepo = new GroupRepository(pool)
    const repo = new TournamentRepository(pool)

    await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2])
    await repo.updateStatus(tournamentId, 'group_stage_active')

    // Backdate updated_at by 10 days so it qualifies as idle (threshold = 7 days)
    await pool.query(
      `UPDATE public.tournaments SET updated_at = now() - interval '10 days' WHERE id = $1`,
      [tournamentId]
    )
    // Backdate group_matches too so the "last activity" check passes
    await pool.query(
      `UPDATE public.group_matches SET updated_at = now() - interval '10 days' WHERE tournament_id = $1`,
      [tournamentId]
    )

    const result = await sweepIdleCasualTournaments(pool, 7)
    expect(result.swept).toBeGreaterThanOrEqual(1)

    const t = await repo.findById(tournamentId)
    expect(t!.status).toBe('abandoned')
  })

  // ── 7. Sweep skips non-idle (recent) tournament ───────────────────────────

  it('7. sweepIdleCasualTournaments skips recently-updated tournaments', async () => {
    const tournamentId = await createCasualTournament(pool, organizerId)
    const p1 = await registerPlayer(pool, tournamentId)
    const p2 = await registerPlayer(pool, tournamentId)

    const groupRepo = new GroupRepository(pool)
    const repo = new TournamentRepository(pool)

    await groupRepo.createGroups(tournamentId, 1, 1, [p1, p2])
    await repo.updateStatus(tournamentId, 'group_stage_active')
    // updated_at is now() — not idle

    const before = await repo.findById(tournamentId)
    const resultBefore = await sweepIdleCasualTournaments(pool, 7)

    const t = await repo.findById(tournamentId)
    expect(t!.status).toBe('group_stage_active')
    // The recently-updated tournament must not have been swept
    expect(before!.status).toBe('group_stage_active')
  })
})
