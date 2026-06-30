/**
 * B-NOTIFYLVL — Integration tests for PATCH /player/groups/:groupId/members/:playerId/notify-level
 *
 * Tests the three behaviors:
 *   1. 200 — member changes their own notify_level; persisted to DB
 *   2. 200 — owner changes a member's notify_level
 *   3. 403 — non-member (third party) cannot change someone else's notify_level
 *   4. 400 — invalid notify_level value
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

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `nlvl-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    `Player ${uid()}`,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email }
}

async function playerToken(
  player: { id: string; email: string },
  tokenStore: InMemoryTokenStore
): Promise<string> {
  const session = await generatePlayerSession(
    {
      playerId: player.id,
      tournamentId: crypto.randomUUID(),
      email: player.email,
      createdAt: Date.now(),
    },
    3600,
    tokenStore
  )
  return session.token
}

async function createGroup(app: Express, ownerToken: string): Promise<{ id: string }> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `Notify Level Group ${uid()}` })
  expect(res.status).toBe(201)
  return { id: res.body.id }
}

async function addMember(pool: Pool, groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT DO NOTHING`,
    [groupId, playerId]
  )
}

async function getNotifyLevel(pool: Pool, groupId: string, playerId: string): Promise<string> {
  const result = await pool.query(
    `SELECT notify_level FROM public.player_group_members WHERE group_id = $1 AND player_id = $2`,
    [groupId, playerId]
  )
  return result.rows[0]?.notify_level
}

describe('B-NOTIFYLVL — PATCH /player/groups/:groupId/members/:playerId/notify-level', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

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

  it('200 — member sets their own notify_level and it is persisted', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)

    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const res = await request(app)
      .patch(`/player/groups/${group.id}/members/${member.id}/notify-level`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ notifyLevel: 'muted' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })

    const stored = await getNotifyLevel(pool, group.id, member.id)
    expect(stored).toBe('muted')
  })

  it('200 — owner can change any member\'s notify_level', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const res = await request(app)
      .patch(`/player/groups/${group.id}/members/${member.id}/notify-level`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notifyLevel: 'all' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })

    const stored = await getNotifyLevel(pool, group.id, member.id)
    expect(stored).toBe('all')
  })

  it('403 — a non-owner cannot change another member\'s notify_level', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const outsider = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const outsiderToken = await playerToken(outsider, tokenStore)

    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)
    await addMember(pool, group.id, outsider.id)

    const res = await request(app)
      .patch(`/player/groups/${group.id}/members/${member.id}/notify-level`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ notifyLevel: 'muted' })

    expect(res.status).toBe(403)
  })

  it('400 — invalid notify_level value is rejected', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroup(app, ownerToken)

    const res = await request(app)
      .patch(`/player/groups/${group.id}/members/${owner.id}/notify-level`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notifyLevel: 'everything' })

    expect(res.status).toBe(400)
  })
})
