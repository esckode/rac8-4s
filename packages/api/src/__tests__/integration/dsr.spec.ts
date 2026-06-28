/**
 * G5.1 — DSR orchestration: erase + export + operator entrypoint (RED tests)
 *
 * Tests:
 *   1. erase: happy path — messages tombstoned, poll votes deleted, match slots nulled, membership removed
 *   2. erase: co-participant data untouched — co-participant's slot and messages intact
 *   3. erase: idempotent — calling twice returns 'erased' both times
 *   4. erase: not_found — non-existent email → {status:'not_found'}
 *   5. export: returns player data — correct counts and group list
 *   6. export: not_found — non-existent email → {status:'not_found'}
 *   7. POST /api/admin/dsr erase — HTTP route with organizer auth → 200 {status:'erased'}
 *   8. POST /api/admin/dsr export — HTTP route with organizer auth → 200 with player data
 *   9. POST /api/admin/dsr: unauthenticated → 401
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, OrganizerFactory } from '../factories'
import { DataSubjectRequestService } from '../../dsr-service'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Insert a player_group and add owner. Returns groupId. */
async function createGroup(pool: Pool, ownerPlayerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by)
     VALUES ($1, $2)
     RETURNING id`,
    [`dsr-test-group-${uid()}`, ownerPlayerId]
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'owner')`,
    [groupId, ownerPlayerId]
  )
  return groupId
}

/** Insert a group_message for a player in a group. Returns message id. */
async function insertGroupMessage(pool: Pool, groupId: string, playerId: string, body: string): Promise<string> {
  // Need a conversation row first
  const convRes = await pool.query(
    `INSERT INTO messaging.conversations (type, group_id)
     VALUES ('group', $1)
     ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [groupId]
  )
  let convId: string
  if (convRes.rows.length > 0) {
    convId = convRes.rows[0].id as string
  } else {
    const existing = await pool.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId]
    )
    convId = existing.rows[0].id as string
  }

  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body)
     VALUES ($1, $2, 'Test Player', $3)
     RETURNING id`,
    [convId, playerId, body]
  )
  return msgRes.rows[0].id as string
}

/** Insert a poll vote for a player. Assumes a poll message exists. Returns pollId. */
async function insertPollAndVote(pool: Pool, groupId: string, creatorId: string, voterId: string): Promise<string> {
  // Need conversation
  const convRes = await pool.query(
    `INSERT INTO messaging.conversations (type, group_id)
     VALUES ('group', $1)
     ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [groupId]
  )
  let convId: string
  if (convRes.rows.length > 0) {
    convId = convRes.rows[0].id as string
  } else {
    const existing = await pool.query(`SELECT id FROM messaging.conversations WHERE group_id = $1`, [groupId])
    convId = existing.rows[0].id as string
  }

  // Insert poll message
  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, $2, 'Test Creator', $3, 'poll')
     RETURNING id`,
    [convId, creatorId, 'Will you attend?']
  )
  const messageId = msgRes.rows[0].id as string

  // Insert poll row
  await pool.query(
    `INSERT INTO messaging.polls (message_id, question)
     VALUES ($1, $2)`,
    [messageId, 'Will you attend?']
  )

  // Insert vote (poll_votes uses message_id as the join key)
  await pool.query(
    `INSERT INTO messaging.poll_votes (message_id, player_id, choice)
     VALUES ($1, $2, 'in')
     ON CONFLICT (message_id, player_id) DO UPDATE SET choice = 'in'`,
    [messageId, voterId]
  )

  return messageId
}

/** Insert match log + participant slots. Returns match log id. */
async function insertMatchWithParticipants(
  pool: Pool,
  groupId: string,
  player1Id: string,
  player2Id: string
): Promise<string> {
  // Need a tournament (can be minimal)
  const tournamentId = `tournament_dsr_${uid()}`
  await pool.query(
    `INSERT INTO public.tournaments
       (id, name, sport, match_format, creator_id, status, max_players, mode, visibility,
        registration_deadline, group_stage_deadline, knockout_stage_deadline, created_at, updated_at)
     VALUES ($1, $2, 'tennis', 'singles', $3, 'group_stage_active', 8, 'casual', 'unlisted',
             NULL, NULL, NULL, NOW(), NOW())`,
    [tournamentId, `dsr-t-${uid()}`, player1Id]
  )

  const matchRef = `match-dsr-${uid()}`
  const logRes = await pool.query(
    `INSERT INTO public.group_match_log (tournament_id, group_id, match_ref, winning_side)
     VALUES ($1, $2, $3, 'team1')
     RETURNING id`,
    [tournamentId, groupId, matchRef]
  )
  const matchLogId = logRes.rows[0].id as string

  await pool.query(
    `INSERT INTO public.group_match_participants (match_log_id, slot, player_id, name_snapshot, side)
     VALUES ($1, 0, $2, 'P1', 'team1'), ($1, 1, $3, 'P2', 'team2')`,
    [matchLogId, player1Id, player2Id]
  )

  return matchLogId
}

// ─────────────────────────────────────────────────────────────────────────────

describe('G5.1 DSR orchestration', () => {
  let pool: Pool
  let app: Express
  let jwtConfig: JwtConfig
  let svc: DataSubjectRequestService

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    jwtConfig = deps.jwtConfig
    svc = new DataSubjectRequestService(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // ─── 1. erase: happy path ────────────────────────────────────────────────

  describe('1. erase happy path', () => {
    it('erases group messages (tombstone), poll votes (delete), match slots (null player_id), and membership', async () => {
      const target = await PlayerFactory.create(pool)
      const other = await PlayerFactory.create(pool)
      const groupId = await createGroup(pool, target.id)

      // Add co-member
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
        [groupId, other.id]
      )

      // Insert data for target
      await insertGroupMessage(pool, groupId, target.id, 'hello from target')
      await insertPollAndVote(pool, groupId, other.id, target.id)
      await insertMatchWithParticipants(pool, groupId, target.id, other.id)

      const result = await svc.erase(target.email)
      expect(result.status).toBe('erased')
      if (result.status !== 'erased') return
      expect(result.playerId).toBe(target.id)

      // Messages: body should be '' and player_id should be NULL
      const msgs = await pool.query(
        `SELECT body, player_id FROM messaging.group_messages WHERE player_id IS NOT NULL AND player_id = $1`,
        [target.id]
      )
      expect(msgs.rows).toHaveLength(0)

      // Poll votes: deleted
      const votes = await pool.query(
        `SELECT * FROM messaging.poll_votes WHERE player_id = $1`,
        [target.id]
      )
      expect(votes.rows).toHaveLength(0)

      // Match slots: player_id nulled
      const slots = await pool.query(
        `SELECT player_id FROM public.group_match_participants WHERE player_id = $1`,
        [target.id]
      )
      expect(slots.rows).toHaveLength(0)

      // Membership removed
      const membership = await pool.query(
        `SELECT * FROM public.player_group_members WHERE player_id = $1`,
        [target.id]
      )
      expect(membership.rows).toHaveLength(0)
    })
  })

  // ─── 2. co-participant data untouched ────────────────────────────────────

  describe('2. co-participant data untouched', () => {
    it("co-participant's match slot and messages remain intact after erase", async () => {
      const target = await PlayerFactory.create(pool)
      const co = await PlayerFactory.create(pool)
      const groupId = await createGroup(pool, co.id)

      // Add target as member
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
        [groupId, target.id]
      )

      await insertGroupMessage(pool, groupId, co.id, 'hello from co')
      const matchLogId = await insertMatchWithParticipants(pool, groupId, target.id, co.id)

      await svc.erase(target.email)

      // Co-participant's message still intact
      const msgs = await pool.query(
        `SELECT * FROM messaging.group_messages WHERE player_id = $1`,
        [co.id]
      )
      expect(msgs.rows.length).toBeGreaterThan(0)
      expect(msgs.rows[0].body).toBe('hello from co')

      // Co-participant's match slot still has player_id
      const slots = await pool.query(
        `SELECT player_id FROM public.group_match_participants
         WHERE match_log_id = $1 AND player_id = $2`,
        [matchLogId, co.id]
      )
      expect(slots.rows).toHaveLength(1)
    })
  })

  // ─── 3. erase: idempotent ────────────────────────────────────────────────

  describe('3. erase idempotent', () => {
    it('calling erase twice returns erased both times without error', async () => {
      const player = await PlayerFactory.create(pool)
      const groupId = await createGroup(pool, player.id)
      await insertGroupMessage(pool, groupId, player.id, 'msg')

      const r1 = await svc.erase(player.email)
      expect(r1.status).toBe('erased')

      const r2 = await svc.erase(player.email)
      expect(r2.status).toBe('erased')
    })
  })

  // ─── 4. erase: not_found ─────────────────────────────────────────────────

  describe('4. erase not_found', () => {
    it('returns not_found for non-existent email', async () => {
      const result = await svc.erase('nobody@nowhere-dsr.invalid')
      expect(result.status).toBe('not_found')
    })
  })

  // ─── 5. export: returns player data ─────────────────────────────────────

  describe('5. export returns player data', () => {
    it('returns correct counts and group list', async () => {
      const player = await PlayerFactory.create(pool)
      const other = await PlayerFactory.create(pool)
      const groupId = await createGroup(pool, player.id)
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
        [groupId, other.id]
      )

      await insertGroupMessage(pool, groupId, player.id, 'export-msg')
      await insertPollAndVote(pool, groupId, other.id, player.id)
      await insertMatchWithParticipants(pool, groupId, player.id, other.id)

      const result = await svc.export(player.email)
      expect(result.status).toBe('exported')
      if (result.status !== 'exported') return

      expect(result.data.playerId).toBe(player.id)
      expect(result.data.email).toBe(player.email)
      expect(result.data.messageCount).toBeGreaterThanOrEqual(1)
      expect(result.data.pollVoteCount).toBeGreaterThanOrEqual(1)
      expect(result.data.matchCount).toBeGreaterThanOrEqual(1)
      expect(result.data.groups).toHaveLength(1)
      expect(result.data.groups[0].groupId).toBe(groupId)
      expect(result.data.groups[0].role).toBe('owner')
    })
  })

  // ─── 6. export: not_found ────────────────────────────────────────────────

  describe('6. export not_found', () => {
    it('returns not_found for non-existent email', async () => {
      const result = await svc.export('nobody@nowhere-dsr.invalid')
      expect(result.status).toBe('not_found')
    })
  })

  // ─── 7. POST /api/admin/dsr erase ────────────────────────────────────────

  describe('7. POST /api/admin/dsr erase', () => {
    it('erases via HTTP route with organizer auth → 200 {status:"erased"}', async () => {
      const player = await PlayerFactory.create(pool)
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/api/admin/dsr')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: player.email, type: 'erase' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('erased')
    })
  })

  // ─── 8. POST /api/admin/dsr export ───────────────────────────────────────

  describe('8. POST /api/admin/dsr export', () => {
    it('exports via HTTP route with organizer auth → 200 with player data', async () => {
      const player = await PlayerFactory.create(pool)
      const { accessToken } = OrganizerFactory.token(jwtConfig)

      const res = await request(app)
        .post('/api/admin/dsr')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: player.email, type: 'export' })

      expect(res.status).toBe(200)
      expect(res.body.playerId).toBe(player.id)
      expect(res.body.email).toBe(player.email)
    })
  })

  // ─── 9. POST /api/admin/dsr: unauthenticated → 401 ──────────────────────

  describe('9. unauthenticated → 401', () => {
    it('returns 401 when no auth header', async () => {
      const res = await request(app)
        .post('/api/admin/dsr')
        .send({ email: 'x@x.com', type: 'erase' })

      expect(res.status).toBe(401)
    })
  })
})
