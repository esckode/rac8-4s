/**
 * A2.5 — @ref trigger on the group message POST route enqueues an
 * assistant.reply job (RED first).
 *
 * Covers:
 *  - body containing @ref + assistant_enabled=true → 201 AND one
 *    'assistant.reply' job with payload {messageId, conversationId, groupId,
 *    playerId, body} and jobId 'assistant-<messageId>' (Q12 idempotency key;
 *    hyphen not colon — BullMQ rejects ':' in custom job IDs)
 *  - assistant_enabled=false → 201, no assistant.reply job
 *  - no trigger → no assistant.reply job
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `aenq-${uid()}@test.local`
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
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

describe('A2.5 — @ref mention enqueues assistant.reply', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue })
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function createGroup(ownerToken: string): Promise<{ id: string }> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Enqueue Group ${uid()}` })
    expect(res.status).toBe(201)
    return { id: res.body.id }
  }

  function newAssistantJobs(before: number): any[] {
    const all = Array.from((jobQueue as any).jobs.values()) as any[]
    return all.slice(before).filter((j: any) => j.name === 'assistant.reply')
  }

  it('enqueues assistant.reply with the triggering message payload + idempotent jobId', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const before = (jobQueue as any).jobs.size
    const res = await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '@ref when is my next match?' })

    expect(res.status).toBe(201)
    const jobs = newAssistantJobs(before)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(`assistant-${res.body.id}`)
    expect(jobs[0].data).toEqual({
      messageId: res.body.id,
      conversationId: res.body.conversationId,
      groupId: group.id,
      playerId: owner.id,
      body: '@ref when is my next match?',
    })
  })

  it('threads an optional timezone through to the job payload (B4.1)', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const before = (jobQueue as any).jobs.size
    const res = await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '@ref when is my next match?', timezone: 'America/New_York' })

    expect(res.status).toBe(201)
    const jobs = newAssistantJobs(before)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].data.timezone).toBe('America/New_York')
  })

  it('rejects a timezone longer than 64 characters', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const res = await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hello', timezone: 'X'.repeat(65) })

    expect(res.status).toBe(400)
  })

  it('is case-insensitive (@Ref)', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const before = (jobQueue as any).jobs.size
    const res = await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hey @Ref standings please' })

    expect(res.status).toBe(201)
    expect(newAssistantJobs(before)).toHaveLength(1)
  })

  it('does NOT enqueue when the group has assistant_enabled=false (still 201)', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)
    await pool.query(`UPDATE public.player_groups SET assistant_enabled = false WHERE id = $1`, [group.id])

    const before = (jobQueue as any).jobs.size
    const res = await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '@ref are you there?' })

    expect(res.status).toBe(201)
    expect(newAssistantJobs(before)).toHaveLength(0)
  })

  it('does NOT enqueue when there is no trigger', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const before = (jobQueue as any).jobs.size
    const res = await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'the ref said to practice @reffing drills' })

    expect(res.status).toBe(201)
    expect(newAssistantJobs(before)).toHaveLength(0)
  })
})
