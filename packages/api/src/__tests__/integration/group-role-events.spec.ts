/**
 * B-ROLEMSG — Group system events on promote / demote / kick
 *
 * RED tests (TDD): written FIRST; will fail until the handlers emit system events.
 *
 * Covers:
 *  1. Promote posts a system event "X is now an owner" in group history
 *  2. Demote posts a system event "X is now a member" in group history
 *  3. Kick posts nothing — group history unchanged after kick
 *  4. Ordering: system events appear in history in the correct order (promote before demote)
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

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `brolemsg-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    name,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email, name: player.name ?? name }
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
    .send({ name: `RoleEvt ${uid()}` })

  expect(res.status).toBe(201)
  return { id: res.body.id }
}

async function addMemberDirectly(pool: Pool, groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'member')`,
    [groupId, playerId]
  )
}

async function addOwnerDirectly(pool: Pool, groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'owner')`,
    [groupId, playerId]
  )
}

async function getHistory(
  app: Express,
  groupId: string,
  ownerToken: string
): Promise<Array<{ type: string; body: string }>> {
  const res = await request(app)
    .get(`/player/groups/${groupId}/messages`)
    .set('Authorization', `Bearer ${ownerToken}`)

  expect(res.status).toBe(200)
  return res.body.messages as Array<{ type: string; body: string }>
}

// ── Suite 1: Promote posts a system event ────────────────────────────────────

describe('B-ROLEMSG — promote posts system event "is now an owner"', () => {
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

  it('promote emits a system message containing the member name and "owner"', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroup(app, ownerToken)
    await addMemberDirectly(pool, group.id, member.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/members/${member.id}/promote`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)

    // Allow the fire-and-forget postSystemEvent to settle
    await new Promise<void>((resolve) => setImmediate(resolve))

    const messages = await getHistory(app, group.id, ownerToken)
    const systemEvents = messages.filter((m) => m.type === 'system')

    expect(systemEvents.length).toBeGreaterThan(0)
    const promoteMsg = systemEvents.find(
      (m) => m.body.includes(member.name) && m.body.toLowerCase().includes('owner')
    )
    expect(promoteMsg).toBeDefined()
  })
})

// ── Suite 2: Demote posts a system event ─────────────────────────────────────

describe('B-ROLEMSG — demote posts system event "is now a member"', () => {
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

  it('demote emits a system message containing the owner name and "member"', async () => {
    const owner1 = await createPlayer(pool)
    const owner2 = await createPlayer(pool)
    const owner1Token = await playerToken(owner1, tokenStore)

    const group = await createGroup(app, owner1Token)
    await addOwnerDirectly(pool, group.id, owner2.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/members/${owner2.id}/demote`)
      .set('Authorization', `Bearer ${owner1Token}`)

    expect(res.status).toBe(200)

    await new Promise<void>((resolve) => setImmediate(resolve))

    const messages = await getHistory(app, group.id, owner1Token)
    const systemEvents = messages.filter((m) => m.type === 'system')

    expect(systemEvents.length).toBeGreaterThan(0)
    const demoteMsg = systemEvents.find(
      (m) => m.body.includes(owner2.name) && m.body.toLowerCase().includes('member')
    )
    expect(demoteMsg).toBeDefined()
  })
})

// ── Suite 3: Kick posts nothing ──────────────────────────────────────────────

describe('B-ROLEMSG — kick posts no system event', () => {
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

  it('kick does not add any system message to group history', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroup(app, ownerToken)
    await addMemberDirectly(pool, group.id, member.id)

    // Capture baseline message count before kick
    const beforeMessages = await getHistory(app, group.id, ownerToken)
    const beforeCount = beforeMessages.filter((m) => m.type === 'system').length

    const res = await request(app)
      .delete(`/player/groups/${group.id}/members/${member.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)

    await new Promise<void>((resolve) => setImmediate(resolve))

    const afterMessages = await getHistory(app, group.id, ownerToken)
    const afterCount = afterMessages.filter((m) => m.type === 'system').length

    // No new system events
    expect(afterCount).toBe(beforeCount)

    // Specifically: no system message references the kicked member's name
    const kickMsg = afterMessages.find(
      (m) => m.type === 'system' && m.body.includes(member.name)
    )
    expect(kickMsg).toBeUndefined()
  })
})

// ── Suite 4: Ordering ────────────────────────────────────────────────────────

describe('B-ROLEMSG — system events appear in history in correct order', () => {
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

  it('promote then demote: system events appear in that order in history', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)

    const group = await createGroup(app, ownerToken)
    await addMemberDirectly(pool, group.id, member.id)

    // Promote
    await request(app)
      .post(`/player/groups/${group.id}/members/${member.id}/promote`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    await new Promise<void>((resolve) => setImmediate(resolve))

    // Demote
    await request(app)
      .post(`/player/groups/${group.id}/members/${member.id}/demote`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    await new Promise<void>((resolve) => setImmediate(resolve))

    const messages = await getHistory(app, group.id, ownerToken)
    const systemEvents = messages.filter((m) => m.type === 'system')

    const promoteIdx = systemEvents.findIndex(
      (m) => m.body.includes(member.name) && m.body.toLowerCase().includes('owner')
    )
    const demoteIdx = systemEvents.findIndex(
      (m) => m.body.includes(member.name) && m.body.toLowerCase().includes('member')
    )

    expect(promoteIdx).toBeGreaterThanOrEqual(0)
    expect(demoteIdx).toBeGreaterThanOrEqual(0)
    // promote event comes before demote event
    expect(promoteIdx).toBeLessThan(demoteIdx)
  })
})
