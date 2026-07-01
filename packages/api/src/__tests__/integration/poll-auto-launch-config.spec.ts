/**
 * P3.2 — Poll auto-launch config schema (RED tests)
 *
 * Tests:
 *   1. Schema: messaging.polls has auto_close_at, auto_launch, min_players, launch_match_format
 *   2. createPoll stores auto_close_at when provided
 *   3. createPoll stores auto_launch + min_players + launch_match_format when provided
 *   4. createPoll with no config — defaults are NULL / false
 *   5. POST /player/groups/:groupId/polls 201 response includes new config fields
 *   6. GET /player/groups/:groupId/polls/:pollId/votes includes new config fields
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { PollRepository } from '../../repositories/poll-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `p3-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    name,
    undefined,
    undefined,
    defaultAdultAttestation(),
  )
  return { id: player.id, email: player.email, name: player.name ?? name }
}

async function playerToken(
  player: { id: string; email: string },
  tokenStore: InMemoryTokenStore,
): Promise<string> {
  const session = await generatePlayerSession(
    {
      playerId: player.id,
      tournamentId: crypto.randomUUID(),
      email: player.email,
      createdAt: Date.now(),
    },
    3600,
    tokenStore,
  )
  return session.token
}

async function createGroupViaApi(app: Express, ownerToken: string): Promise<{ id: string }> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `P3.2 Group ${uid()}` })
  expect(res.status).toBe(201)
  return { id: res.body.id }
}

let pool: Pool
let app: Express
let tokenStore: InMemoryTokenStore

describe('P3.2 — Poll auto-launch config schema', () => {
  // Nested one level inside the describe (rather than at file top-level) so this
  // afterAll runs — and releases the suite connection — before the global afterAll
  // in setup.ts calls closeTestPool(). Same-scope afterAll hooks run in registration
  // order, so a top-level afterAll here would race the global one and pool.end()
  // would hang forever waiting for this still-checked-out client.
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('1. Schema columns exist', () => {
    it('messaging.polls has auto_close_at, auto_launch, min_players, launch_match_format', async () => {
      const result = await pool.query(
        `SELECT column_name, data_type, column_default
         FROM information_schema.columns
         WHERE table_schema = 'messaging' AND table_name = 'polls'
           AND column_name IN ('auto_close_at', 'auto_launch', 'min_players', 'launch_match_format')
         ORDER BY column_name`,
      )
      const cols = new Map(result.rows.map((r: any) => [r.column_name, r]))
      expect(cols.has('auto_close_at')).toBe(true)
      expect(cols.has('auto_launch')).toBe(true)
      expect(cols.has('min_players')).toBe(true)
      expect(cols.has('launch_match_format')).toBe(true)

      // auto_launch default is false
      const autoLaunch = cols.get('auto_launch')!
      expect(autoLaunch.column_default).toContain('false')
    })
  })

  describe('2. createPoll stores auto_close_at', () => {
    it('stores auto_close_at when provided', async () => {
      const owner = await createPlayer(pool)
      const autoCloseAt = new Date('2026-08-01T12:00:00Z')

      const pollRepo = new PollRepository(pool as any)
      // Create a group and conversation first
      const grpRes = await pool.query(
        `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
        [`p3-grp-${uid()}`, owner.id],
      )
      const groupId = grpRes.rows[0].id as string
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId, owner.id],
      )

      const result = await pollRepo.createPoll({
        groupId,
        creatorPlayerId: owner.id,
        question: 'Are you in?',
        autoCloseAt,
      })

      const row = await pool.query(
        `SELECT auto_close_at FROM messaging.polls WHERE id = $1`,
        [result.pollId],
      )
      expect(row.rows[0].auto_close_at).not.toBeNull()
      const stored = new Date(row.rows[0].auto_close_at)
      expect(stored.toISOString()).toBe(autoCloseAt.toISOString())
    })
  })

  describe('3. createPoll stores auto_launch config', () => {
    it('stores auto_launch, min_players, launch_match_format', async () => {
      const owner = await createPlayer(pool)
      const pollRepo = new PollRepository(pool as any)

      const grpRes = await pool.query(
        `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
        [`p3-grp-${uid()}`, owner.id],
      )
      const groupId = grpRes.rows[0].id as string
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId, owner.id],
      )

      const result = await pollRepo.createPoll({
        groupId,
        creatorPlayerId: owner.id,
        question: 'Game this weekend?',
        autoLaunch: true,
        minPlayers: 6,
        launchMatchFormat: 'round_robin',
      })

      const row = await pool.query(
        `SELECT auto_launch, min_players, launch_match_format FROM messaging.polls WHERE id = $1`,
        [result.pollId],
      )
      expect(row.rows[0].auto_launch).toBe(true)
      expect(row.rows[0].min_players).toBe(6)
      expect(row.rows[0].launch_match_format).toBe('round_robin')
    })
  })

  describe('4. createPoll without config — defaults', () => {
    it('has NULL / false defaults when config fields are omitted', async () => {
      const owner = await createPlayer(pool)
      const pollRepo = new PollRepository(pool as any)

      const grpRes = await pool.query(
        `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
        [`p3-grp-${uid()}`, owner.id],
      )
      const groupId = grpRes.rows[0].id as string
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
        [groupId, owner.id],
      )

      const result = await pollRepo.createPoll({
        groupId,
        creatorPlayerId: owner.id,
        question: 'Simple poll',
      })

      const row = await pool.query(
        `SELECT auto_close_at, auto_launch, min_players, launch_match_format
         FROM messaging.polls WHERE id = $1`,
        [result.pollId],
      )
      expect(row.rows[0].auto_close_at).toBeNull()
      expect(row.rows[0].auto_launch).toBe(false)
      expect(row.rows[0].min_players).toBeNull()
      expect(row.rows[0].launch_match_format).toBeNull()
    })
  })

  describe('5. POST /player/groups/:groupId/polls 201 includes config fields', () => {
    it('201 response body includes autoCloseAt, autoLaunch, minPlayers, launchMatchFormat', async () => {
      const owner = await createPlayer(pool)
      const token = await playerToken(owner, tokenStore)
      const { id: groupId } = await createGroupViaApi(app, token)

      const autoCloseAt = '2026-08-15T18:00:00Z'

      const res = await request(app)
        .post(`/player/groups/${groupId}/polls`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          question: 'Weekend game?',
          targetTime: '2026-08-16T10:00:00Z',
          autoCloseAt,
          autoLaunch: true,
          minPlayers: 4,
          launchMatchFormat: 'round_robin',
        })

      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('autoCloseAt')
      expect(res.body).toHaveProperty('autoLaunch', true)
      expect(res.body).toHaveProperty('minPlayers', 4)
      expect(res.body).toHaveProperty('launchMatchFormat', 'round_robin')
    })
  })

  describe('6. GET /player/groups/:groupId/polls/:pollId/votes includes config fields', () => {
    it('votes response includes autoCloseAt, autoLaunch, minPlayers, launchMatchFormat', async () => {
      const owner = await createPlayer(pool)
      const token = await playerToken(owner, tokenStore)
      const { id: groupId } = await createGroupViaApi(app, token)

      // Create poll with config
      const createRes = await request(app)
        .post(`/player/groups/${groupId}/polls`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          question: 'Config poll?',
          autoLaunch: false,
          minPlayers: 8,
        })
      expect(createRes.status).toBe(201)
      const pollId = createRes.body.pollId as string

      // Get votes
      const votesRes = await request(app)
        .get(`/player/groups/${groupId}/polls/${pollId}/votes`)
        .set('Authorization', `Bearer ${token}`)

      expect(votesRes.status).toBe(200)
      expect(votesRes.body).toHaveProperty('autoCloseAt')
      expect(votesRes.body).toHaveProperty('autoLaunch', false)
      expect(votesRes.body).toHaveProperty('minPlayers', 8)
      expect(votesRes.body).toHaveProperty('launchMatchFormat')
    })
  })
})
