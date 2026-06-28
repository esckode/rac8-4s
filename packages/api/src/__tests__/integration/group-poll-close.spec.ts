/**
 * G3.2 — Poll auto-close + system follow-up
 *
 * RED tests (TDD): written FIRST; will fail until:
 *   1. Migration 043 adds closed_at + creator_player_id to messaging.polls.
 *   2. PollRepository.closePoll() sets closed_at, posts system message, returns tally.
 *   3. PollRepository.castVote() rejects with POLL_CLOSED when closed_at IS NOT NULL.
 *   4. POST /player/groups/:groupId/polls/:messageId/close (creator or group owner only).
 *
 * Suites:
 *   A. Migration: closed_at column exists and is nullable.
 *   B. closePoll(): sets closed_at, posts system tally message, returns tally.
 *   C. Closed poll vote freeze: voting after close returns 409.
 *   D. History still shows poll message + tally after close.
 *   E. Authorization: only creator or group owner can close (member → 403).
 *   F. Idempotency: closing an already-closed poll is a no-op (or 409).
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
import { GroupMessageRepository } from '../../repositories/group-message-repository'
import { ConversationRepository } from '../../repositories/conversation-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `gpollclose-${uid()}@test.local`
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

async function createGroupViaApi(app: Express, ownerToken: string): Promise<{ id: string }> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `PollClose Test Group ${uid()}` })
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

async function createPollViaApi(
  app: Express,
  token: string,
  groupId: string,
  question = 'Are you in for tonight?'
): Promise<{ pollId: string; messageId: string }> {
  const res = await request(app)
    .post(`/player/groups/${groupId}/polls`)
    .set('Authorization', `Bearer ${token}`)
    .send({ question })
  expect(res.status).toBe(201)
  return { pollId: res.body.pollId, messageId: res.body.messageId }
}

// ── Suite A: Migration — closed_at column ─────────────────────────────────────

describe('G3.2 — migration 043: closed_at column exists and is nullable', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('messaging.polls has closed_at column that is nullable', async () => {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'messaging'
        AND table_name = 'polls'
        AND column_name = 'closed_at'
    `)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].is_nullable).toBe('YES')
    // Must be a timestamp with time zone (TIMESTAMPTZ = "timestamp with time zone")
    expect(res.rows[0].data_type).toMatch(/timestamp/)
  })

  it('messaging.polls has creator_player_id column that is nullable', async () => {
    const res = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'messaging'
        AND table_name = 'polls'
        AND column_name = 'creator_player_id'
    `)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].is_nullable).toBe('YES')
  })

  it('a newly inserted poll has closed_at = NULL by default', async () => {
    const playerRepo = new PlayerRepository(pool)
    const player = await playerRepo.findOrCreatePlayerByEmail(
      `mig-poll-${uid()}@test.local`,
      `Mig Player ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )

    // Create a minimal group
    const groupRes = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Mig Group ${uid()}`, player.id]
    )
    const groupId = groupRes.rows[0].id
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
      [groupId, player.id]
    )

    const pollRepo = new PollRepository(pool)
    const { pollId } = await pollRepo.createPoll({
      groupId,
      creatorPlayerId: player.id,
      question: 'Migration test poll?',
    })

    const row = await pool.query(
      `SELECT closed_at FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    expect(row.rows[0].closed_at).toBeNull()
  })
})

// ── Suite B: closePoll() — sets closed_at, posts system tally message ──────────

describe('G3.2 — closePoll(): sets closed_at, posts system tally summary message', () => {
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

  it('POST /groups/:groupId/polls/:messageId/close sets closed_at and posts system message', async () => {
    const owner = await createPlayer(pool)
    const member1 = await createPlayer(pool)
    const member2 = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const member1Token = await playerToken(member1, tokenStore)
    const member2Token = await playerToken(member2, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member1.id)
    await addMember(pool, group.id, member2.id)

    const { pollId, messageId } = await createPollViaApi(app, ownerToken, group.id)

    // Cast some votes: owner=in, member1=out, member2=maybe
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${member1Token}`)
      .send({ choice: 'out' })
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${member2Token}`)
      .send({ choice: 'maybe' })

    // Close the poll (owner)
    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(closeRes.status).toBe(200)
    expect(closeRes.body).toMatchObject({
      tally: { in: 1, out: 1, maybe: 1 },
    })

    // Verify closed_at is set in DB
    const pollRow = await pool.query(
      `SELECT closed_at FROM messaging.polls WHERE id = $1`,
      [pollId]
    )
    expect(pollRow.rows[0].closed_at).not.toBeNull()

    // Verify system message was posted with tally summary
    const convRepo = new ConversationRepository(pool)
    const conversationId = await convRepo.resolveGroupConversation(group.id)
    const msgRepo = new GroupMessageRepository(pool)
    const history = await msgRepo.getGroupHistory({ conversationId })
    const systemMessages = history.filter(m => m.type === 'system')
    // Should have at least one system message with tally in the body
    const tallyMsg = systemMessages.find(m => m.body.includes('in') && m.body.includes('out'))
    expect(tallyMsg).toBeDefined()
    // The tally message body should contain the counts
    expect(tallyMsg!.body).toMatch(/1 in/)
    expect(tallyMsg!.body).toMatch(/1 out/)
    expect(tallyMsg!.body).toMatch(/1 maybe/)
  })

  it('closePoll() returns tally at close time', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const { pollId, messageId } = await createPollViaApi(app, ownerToken, group.id, 'Weekend?')

    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ choice: 'in' })

    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(closeRes.status).toBe(200)
    expect(closeRes.body.tally).toEqual({ in: 2, out: 0, maybe: 0 })
  })
})

// ── Suite C: Closed poll vote freeze (409) ────────────────────────────────────

describe('G3.2 — closed poll freezes: vote after close returns 409', () => {
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

  it('voting on a closed poll returns 409 POLL_CLOSED', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { pollId, messageId } = await createPollViaApi(app, ownerToken, group.id)

    // Vote before close
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })

    // Close the poll
    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(closeRes.status).toBe(200)

    // Attempt to vote again — should be rejected
    const voteRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'out' })

    expect(voteRes.status).toBe(409)
    expect(voteRes.body.code).toBe('POLL_CLOSED')
  })

  it('voting on an open poll still works normally', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { pollId } = await createPollViaApi(app, ownerToken, group.id, 'Open poll?')

    const voteRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'maybe' })

    expect(voteRes.status).toBe(201)
  })
})

// ── Suite D: History shows poll + tally after close ────────────────────────────

describe('G3.2 — history: poll message + tally accessible after close', () => {
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

  it('GET /groups/:groupId/messages still returns the poll message after close', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { pollId, messageId } = await createPollViaApi(app, ownerToken, group.id, 'Closed poll?')

    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })

    // Close the poll
    await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)

    // History should still include the poll message
    const histRes = await request(app)
      .get(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(histRes.status).toBe(200)

    const pollMsg = histRes.body.messages.find((m: any) => m.id === messageId)
    expect(pollMsg).toBeDefined()
    expect(pollMsg.type).toBe('poll')
  })

  it('GET /groups/:groupId/polls/:pollId/votes still returns tally after close', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const { pollId, messageId } = await createPollViaApi(app, ownerToken, group.id, 'Tally after close?')

    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ choice: 'out' })

    // Close the poll
    await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)

    // Tally should still be accessible
    const tallyRes = await request(app)
      .get(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(tallyRes.status).toBe(200)
    expect(tallyRes.body.tally).toEqual({ in: 1, out: 1, maybe: 0 })
  })
})

// ── Suite E: Authorization — only creator or group owner can close ─────────────

describe('G3.2 — authorization: only creator or group owner can close', () => {
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

  it('non-creator member (not owner) gets 403 when trying to close', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    // Owner creates poll (owner is the creator)
    const { messageId } = await createPollViaApi(app, ownerToken, group.id, 'Close auth test?')

    // Non-creator member tries to close → 403
    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${memberToken}`)

    expect(closeRes.status).toBe(403)
  })

  it('poll creator (non-owner member) can close their own poll', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    // Member creates poll (member is the creator)
    const { messageId } = await createPollViaApi(app, memberToken, group.id, 'Member close test?')

    // Member closes their own poll → 200
    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${memberToken}`)

    expect(closeRes.status).toBe(200)
  })

  it('group owner can close any poll (not just their own)', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    // Member creates poll
    const { messageId } = await createPollViaApi(app, memberToken, group.id, 'Owner close test?')

    // Owner closes member's poll → 200
    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(closeRes.status).toBe(200)
  })

  it('non-member gets 403', async () => {
    const owner = await createPlayer(pool)
    const nonMember = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const nonMemberToken = await playerToken(nonMember, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { messageId } = await createPollViaApi(app, ownerToken, group.id, 'Non-member close?')

    const closeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${nonMemberToken}`)

    expect(closeRes.status).toBe(403)
  })
})

// ── Suite F: Idempotency ───────────────────────────────────────────────────────

describe('G3.2 — idempotency: closing an already-closed poll is a no-op or 409', () => {
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

  it('closing an already-closed poll returns 409 POLL_ALREADY_CLOSED', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { messageId } = await createPollViaApi(app, ownerToken, group.id, 'Idempotent close?')

    // First close → 200
    const firstClose = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(firstClose.status).toBe(200)

    // Second close → 409
    const secondClose = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(secondClose.status).toBe(409)
    expect(secondClose.body.code).toBe('POLL_ALREADY_CLOSED')
  })
})
