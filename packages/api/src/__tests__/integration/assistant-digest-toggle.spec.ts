/**
 * C2.1 — Weekly digest per-group opt-in toggle (RED first)
 *
 * GET /player/groups returns digestEnabled per group, defaulting false
 * (opt-in, unlike assistantEnabled which defaults true). PATCH
 * /:groupId {digestEnabled} is owner-only (member → 403); round-trips
 * false→true→false. Mirrors the A6.1 assistantEnabled test pattern.
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
  const email = `digest-${uid()}@test.local`
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

describe('C2.1 — digest opt-in toggle', () => {
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

  async function createGroup(ownerToken: string): Promise<{ id: string }> {
    const res = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Digest Group ${uid()}` })
    expect(res.status).toBe(201)
    return { id: res.body.id }
  }

  it('GET /player/groups returns digestEnabled=false by default', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    await createGroup(token)

    const res = await request(app).get('/player/groups').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const group = res.body.groups.find((g: any) => g.digestEnabled !== undefined)
    expect(group.digestEnabled).toBe(false)
  })

  it('PATCH digestEnabled is owner-only (member → 403)', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerTok = await playerToken(owner, tokenStore)
    const memberTok = await playerToken(member, tokenStore)
    const group = await createGroup(ownerTok)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [group.id, member.id]
    )

    const res = await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${memberTok}`)
      .send({ digestEnabled: true })

    expect(res.status).toBe(403)
  })

  it('PATCH round-trips false → true → false', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const on = await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ digestEnabled: true })
    expect(on.status).toBe(200)
    expect(on.body.digestEnabled).toBe(true)

    const off = await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ digestEnabled: false })
    expect(off.status).toBe(200)
    expect(off.body.digestEnabled).toBe(false)
  })

  it('rejects a non-boolean digestEnabled', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const res = await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ digestEnabled: 'yes' })

    expect(res.status).toBe(400)
  })
})
