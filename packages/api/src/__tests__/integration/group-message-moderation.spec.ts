/**
 * G2.3 — Moderation: owner delete-message (tombstone)
 *
 * RED tests (TDD): written FIRST; will fail until:
 *   1. Migration 041 is applied (removed_at, removed_by columns on group_messages).
 *   2. GroupMessageRepository.removeGroupMessage is implemented.
 *   3. DELETE /player/groups/:groupId/messages/:messageId route is implemented (owner-only).
 *
 * All DB work runs via getTestPool() so nothing is committed.
 *
 * Suites:
 *   A. Owner can tombstone any member's message → body cleared, attribution dropped, marked removed
 *   B. NEGATIVE: non-owner member → 403 (security-critical)
 *   C. History still returns tombstone in original position (message order preserved)
 *   D. Moderation tombstone is distinguishable from DSR anonymization
 *   E. Assert no reporting/blocking route exists (§11.6 — absent by design)
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
import { ConversationRepository } from '../../repositories/conversation-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `gmod-${uid()}@test.local`
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
    .send({ name: `Mod Group ${uid()}` })
  expect(res.status).toBe(201)
  return { id: res.body.id }
}

async function addMember(pool: Pool, groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (group_id, player_id) DO NOTHING`,
    [groupId, playerId]
  )
}

/** Post a message and return its id. */
async function postMessage(
  app: Express,
  groupId: string,
  token: string,
  body: string
): Promise<string> {
  const res = await request(app)
    .post(`/player/groups/${groupId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body })
  expect(res.status).toBe(201)
  return res.body.id as string
}

// ── Suite A: Owner tombstones a member's message ─────────────────────────────

describe('G2.3 — Moderation: owner can delete (tombstone) any message', () => {
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

  it('owner DELETE tombstones the message: body cleared, attribution dropped, marked removed', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const messageId = await postMessage(app, group.id, memberToken, 'This is a bad message')

    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${messageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify DB state: body cleared, attribution dropped (player_id=null,
    // sender_name_snapshot=''), removed_at and removed_by set.
    const row = await pool.query(
      `SELECT body, player_id, sender_name_snapshot, removed_at, removed_by
       FROM messaging.group_messages WHERE id = $1`,
      [messageId]
    )
    expect(row.rows).toHaveLength(1)
    const r = row.rows[0]
    expect(r.body).toBe('')
    expect(r.player_id).toBeNull()
    expect(r.sender_name_snapshot).toBe('')
    expect(r.removed_at).not.toBeNull()
    expect(r.removed_by).toBe(owner.id)
  })

  it('owner can tombstone their own message', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroup(app, ownerToken)

    const messageId = await postMessage(app, group.id, ownerToken, 'My own message')

    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${messageId}`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    const row = await pool.query(
      `SELECT removed_at, removed_by FROM messaging.group_messages WHERE id = $1`,
      [messageId]
    )
    expect(row.rows[0].removed_at).not.toBeNull()
    expect(row.rows[0].removed_by).toBe(owner.id)
  })

  it('DELETE on non-existent message → 404', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroup(app, ownerToken)
    const fakeId = crypto.randomUUID()

    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${fakeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(404)
  })
})

// ── Suite B: NEGATIVE — member cannot delete (security-critical) ─────────────

describe('G2.3 — NEGATIVE: non-owner member cannot delete a message → 403', () => {
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

  it('a member (non-owner) cannot delete any message → 403', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const messageId = await postMessage(app, group.id, ownerToken, 'Owner message to try to delete')

    // Member attempts to delete
    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${messageId}`)
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(403)

    // Verify row was NOT tombstoned
    const row = await pool.query(
      `SELECT removed_at FROM messaging.group_messages WHERE id = $1`,
      [messageId]
    )
    expect(row.rows[0].removed_at).toBeNull()
  })

  it('a member cannot delete their own message → 403 (owner-only moderation)', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const messageId = await postMessage(app, group.id, memberToken, 'My own message I want to delete')

    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${messageId}`)
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(403)
  })

  it('an outsider (not a member) cannot delete → 403', async () => {
    const owner = await createPlayer(pool)
    const outsider = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const outsiderToken = await playerToken(outsider, tokenStore)
    const group = await createGroup(app, ownerToken)

    const messageId = await postMessage(app, group.id, ownerToken, 'Owner message')

    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${messageId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)

    expect(res.status).toBe(403)
  })

  it('unauthenticated request → 401', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroup(app, ownerToken)
    const messageId = await postMessage(app, group.id, ownerToken, 'Another message')

    const res = await request(app)
      .delete(`/player/groups/${group.id}/messages/${messageId}`)

    expect(res.status).toBe(401)
  })
})

// ── Suite C: History returns tombstone in original order ──────────────────────

describe('G2.3 — History returns tombstone in original order as "message removed"', () => {
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

  it('tombstoned message appears in history at original position with body "message removed"', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    // Post 3 messages: before, the one to delete, after
    await postMessage(app, group.id, ownerToken, 'First message')
    const toDeleteId = await postMessage(app, group.id, memberToken, 'Message to remove')
    await postMessage(app, group.id, ownerToken, 'Third message')

    // Owner tombstones the second message
    const delRes = await request(app)
      .delete(`/player/groups/${group.id}/messages/${toDeleteId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(delRes.status).toBe(200)

    // Fetch history
    const histRes = await request(app)
      .get(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(histRes.status).toBe(200)
    const messages = histRes.body.messages as Array<{
      id: string
      body: string
      type: string
      senderName: string | null
      playerId: string | null
      removedAt: string | null
    }>

    // All 3 messages still present (+ possibly system messages from the test setup)
    const bodies = messages.map(m => m.body)
    expect(bodies).toContain('First message')
    expect(bodies).toContain('Third message')
    expect(bodies).not.toContain('Message to remove')

    // The tombstone shows as "message removed"
    const tombstone = messages.find(m => m.id === toDeleteId)
    expect(tombstone).toBeDefined()
    expect(tombstone!.body).toBe('message removed')
    expect(tombstone!.playerId).toBeNull()
    expect(tombstone!.senderName).toBeNull()
    expect(tombstone!.removedAt).not.toBeNull()

    // Order is preserved: First < tombstone < Third
    const firstIdx = messages.findIndex(m => m.body === 'First message')
    const tombstoneIdx = messages.findIndex(m => m.id === toDeleteId)
    const thirdIdx = messages.findIndex(m => m.body === 'Third message')
    expect(firstIdx).toBeGreaterThanOrEqual(0)
    expect(tombstoneIdx).toBeGreaterThanOrEqual(0)
    expect(thirdIdx).toBeGreaterThanOrEqual(0)
    expect(firstIdx).toBeLessThan(tombstoneIdx)
    expect(tombstoneIdx).toBeLessThan(thirdIdx)
  })
})

// ── Suite D: Moderation tombstone vs DSR anonymization ───────────────────────

describe('G2.3 — Moderation tombstone is distinguishable from DSR anonymization', () => {
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

  it('moderation tombstone has removed_at + removed_by set; DSR anonymization does not', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    // Post two messages from the member: one to moderate, one to DSR-anonymize
    const toModerateId = await postMessage(app, group.id, memberToken, 'Moderated message')
    const toDsrId = await postMessage(app, group.id, memberToken, 'DSR erasure message')

    // Moderator tombstones one
    const delRes = await request(app)
      .delete(`/player/groups/${group.id}/messages/${toModerateId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(delRes.status).toBe(200)

    // DSR anonymization of the other via ConversationRepository
    const convRepo = new ConversationRepository(pool)
    await convRepo.anonymizeGroupMessagesFor(member.id)

    // Fetch both rows directly
    const modRow = await pool.query(
      `SELECT player_id, sender_name_snapshot, body, removed_at, removed_by
       FROM messaging.group_messages WHERE id = $1`,
      [toModerateId]
    )
    const dsrRow = await pool.query(
      `SELECT player_id, sender_name_snapshot, body, removed_at, removed_by
       FROM messaging.group_messages WHERE id = $1`,
      [toDsrId]
    )

    // Moderation tombstone: removed_at IS NOT NULL, removed_by IS NOT NULL
    const mod = modRow.rows[0]
    expect(mod.removed_at).not.toBeNull()
    expect(mod.removed_by).toBe(owner.id)
    expect(mod.body).toBe('')            // cleared
    expect(mod.player_id).toBeNull()     // attribution dropped
    expect(mod.sender_name_snapshot).toBe('')

    // DSR anonymization: removed_at IS NULL (DSR does NOT set removed_at)
    const dsr = dsrRow.rows[0]
    expect(dsr.removed_at).toBeNull()
    expect(dsr.removed_by).toBeNull()
    expect(dsr.body).toBe('')
    expect(dsr.player_id).toBeNull()
    expect(dsr.sender_name_snapshot).toBe('Former player')  // DSR marker, not moderation
  })
})

// ── Suite E: Assert no report/block routes exist (§11.6 — absent by design) ──

describe('G2.3 — No reporting/blocking surface exists (§11.6)', () => {
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

  it('POST /player/groups/:groupId/messages/:messageId/report does not exist → 404', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroup(app, ownerToken)
    const messageId = await postMessage(app, group.id, ownerToken, 'A message')

    const res = await request(app)
      .post(`/player/groups/${group.id}/messages/${messageId}/report`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'spam' })

    // 404 confirms no report route exists
    expect(res.status).toBe(404)
  })

  it('POST /player/groups/:groupId/members/:playerId/block does not exist → 404', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroup(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/members/${member.id}/block`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})

    expect(res.status).toBe(404)
  })
})
