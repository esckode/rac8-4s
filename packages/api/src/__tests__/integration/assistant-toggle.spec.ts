/**
 * A6 — Assistant per-group toggle + intro message (RED first)
 *
 * A6.1: GET /player/groups returns assistantEnabled per group; PATCH
 * /:groupId {assistantEnabled} is owner-only (member → 403); round-trips
 * true→false→true.
 * A6.2: an off→on transition (including first-ever enable) posts ONE
 * type='assistant' intro row; repeated true→true does not duplicate;
 * re-enabling after off DOES re-post (design: "rollout flip or owner
 * re-enable" — re-post-on-transition, chosen for simplicity).
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
  const email = `toggle-${uid()}@test.local`
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

describe('A6 — assistant toggle + intro message', () => {
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
      .send({ name: `Toggle Group ${uid()}` })
    expect(res.status).toBe(201)
    return { id: res.body.id }
  }

  it('GET /player/groups returns assistantEnabled=true by default', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    await createGroup(token)

    const res = await request(app).get('/player/groups').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const group = res.body.groups.find((g: any) => g.assistantEnabled !== undefined)
    expect(group.assistantEnabled).toBe(true)
  })

  it('PATCH assistantEnabled is owner-only (member → 403)', async () => {
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
      .send({ assistantEnabled: false })

    expect(res.status).toBe(403)
  })

  it('PATCH round-trips true → false → true', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    const off = await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assistantEnabled: false })
    expect(off.status).toBe(200)
    expect(off.body.assistantEnabled).toBe(false)

    const back = await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assistantEnabled: true })
    expect(back.status).toBe(200)
    expect(back.body.assistantEnabled).toBe(true)
  })

  it('off→on transition posts exactly one intro message', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assistantEnabled: false })

    await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assistantEnabled: true })

    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'assistant'`,
      [group.id]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].body).toContain("I'm Coach")
  })

  it('repeated true→true PATCH does not duplicate the intro', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    // group starts assistant_enabled=true (default); PATCH true→true is a no-op transition
    await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assistantEnabled: true })
    await request(app)
      .patch(`/player/groups/${group.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assistantEnabled: true })

    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'assistant'`,
      [group.id]
    )
    expect(rows.rows).toHaveLength(0)
  })

  it('a second off→on transition re-posts the intro (re-post-on-transition)', async () => {
    const owner = await createPlayer(pool)
    const token = await playerToken(owner, tokenStore)
    const group = await createGroup(token)

    for (const enabled of [false, true, false, true]) {
      await request(app)
        .patch(`/player/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assistantEnabled: enabled })
    }

    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'assistant'`,
      [group.id]
    )
    expect(rows.rows).toHaveLength(2)
  })
})
