/**
 * G3.1 — Poll backend: In/Out/Maybe, re-votable, notify-on-create
 *
 * RED tests (TDD): written FIRST; will fail until:
 *   1. Migration 042 is applied (poll_votes table).
 *   2. PollRepository.createPoll / castVote / getVotes / anonymizePollVotesFor.
 *   3. POST /player/groups/:groupId/polls — member creates a poll (type=poll message).
 *   4. POST /player/groups/:groupId/polls/:pollId/votes — member casts/re-votes.
 *   5. GET  /player/groups/:groupId/polls/:pollId/votes — live tally.
 *   6. notify-on-create reuses G2.4 selector + jobQueue.
 *
 * Suites:
 *   A. Create poll — member authz, 403 for non-members, stores type=poll message
 *   B. Vote — In/Out/Maybe, re-vote replaces (one row per player), non-anonymous tally
 *   C. notify-on-create — enqueues messaging.notify per G2.4 (poll = 'all' + 'mentions_polls')
 *   D. §0.5 CONTRACT TEST — anonymizePollVotesFor removes A's vote, B's row + tally intact, idempotent
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
import { PollRepository } from '../../repositories/poll-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `gpoll-${uid()}@test.local`
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
    .send({ name: `Poll Test Group ${uid()}` })
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

async function addMemberWithLevel(
  pool: Pool,
  groupId: string,
  playerId: string,
  notifyLevel: 'all' | 'mentions_polls' | 'muted'
): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role, notify_level)
     VALUES ($1, $2, 'member', $3)
     ON CONFLICT (group_id, player_id) DO UPDATE SET notify_level = $3`,
    [groupId, playerId, notifyLevel]
  )
}

// ── Suite A: Create poll ──────────────────────────────────────────────────────

describe('G3.1 — poll create: member creates poll, non-member 403', () => {
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

  it('member can create a poll (201, type=poll message in group)', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const targetTime = new Date(Date.now() + 3600_000).toISOString()
    const res = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Are you in for tonight?', targetTime })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      pollId: expect.any(String),
      messageId: expect.any(String),
      question: 'Are you in for tonight?',
    })
  })

  it('non-member gets 403 when trying to create a poll', async () => {
    const owner = await createPlayer(pool)
    const nonMember = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const nonMemberToken = await playerToken(nonMember, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${nonMemberToken}`)
      .send({ question: 'Can I crash this?', targetTime: new Date().toISOString() })

    expect(res.status).toBe(403)
  })

  it('question is required', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ targetTime: new Date().toISOString() })

    expect(res.status).toBe(400)
  })

  it('created poll appears in group message history with type=poll', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const targetTime = new Date(Date.now() + 7200_000).toISOString()
    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Saturday session?', targetTime })
    expect(createRes.status).toBe(201)

    const histRes = await request(app)
      .get(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(histRes.status).toBe(200)
    const pollMessages = histRes.body.messages.filter((m: any) => m.type === 'poll')
    expect(pollMessages).toHaveLength(1)
    expect(pollMessages[0].id).toBe(createRes.body.messageId)
  })
})

// ── Suite B: Vote ──────────────────────────────────────────────────────────────

describe('G3.1 — poll vote: In/Out/Maybe, re-votable, non-anonymous tally', () => {
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

  it('member can vote "in" on a poll (201)', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'In for today?', targetTime: new Date().toISOString() })
    expect(createRes.status).toBe(201)
    const pollId = createRes.body.pollId

    const voteRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })

    expect(voteRes.status).toBe(201)
    expect(voteRes.body).toMatchObject({ choice: 'in' })
  })

  it('member can vote "out" and "maybe"', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Weekend?', targetTime: new Date().toISOString() })
    const pollId = createRes.body.pollId

    const outRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'out' })
    expect(outRes.status).toBe(201)

    const maybeRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ choice: 'maybe' })
    expect(maybeRes.status).toBe(201)
  })

  it('re-voting replaces the existing vote (one row per player)', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Re-vote test?', targetTime: new Date().toISOString() })
    const pollId = createRes.body.pollId

    // First vote: in
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })

    // Re-vote: out
    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'out' })

    // Tally should show 1 row for owner with latest choice = 'out'
    const tallyRes = await request(app)
      .get(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(tallyRes.status).toBe(200)

    const ownerVotes = tallyRes.body.votes.filter((v: any) => v.playerId === owner.id)
    expect(ownerVotes).toHaveLength(1)
    expect(ownerVotes[0].choice).toBe('out')
  })

  it('tally is non-anonymous — shows who voted for what', async () => {
    const owner = await createPlayer(pool)
    const member = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const memberToken = await playerToken(member, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    await addMember(pool, group.id, member.id)

    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Non-anon check?', targetTime: new Date().toISOString() })
    const pollId = createRes.body.pollId

    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'in' })

    await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ choice: 'maybe' })

    const tallyRes = await request(app)
      .get(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(tallyRes.status).toBe(200)

    // Non-anonymous: each vote shows playerId and playerName
    expect(tallyRes.body.votes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: owner.id, choice: 'in' }),
        expect.objectContaining({ playerId: member.id, choice: 'maybe' }),
      ])
    )

    // Tally aggregates
    expect(tallyRes.body.tally).toEqual(
      expect.objectContaining({ in: 1, out: 0, maybe: 1 })
    )
  })

  it('non-member cannot vote (403)', async () => {
    const owner = await createPlayer(pool)
    const nonMember = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const nonMemberToken = await playerToken(nonMember, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Gate check', targetTime: new Date().toISOString() })
    const pollId = createRes.body.pollId

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${nonMemberToken}`)
      .send({ choice: 'in' })

    expect(res.status).toBe(403)
  })

  it('invalid choice is rejected (400)', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const createRes = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Choice test', targetTime: new Date().toISOString() })
    const pollId = createRes.body.pollId

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${pollId}/votes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ choice: 'yes_please' })

    expect(res.status).toBe(400)
  })
})

// ── Suite C: notify-on-create ─────────────────────────────────────────────────

describe('G3.1 — notify-on-create: poll create enqueues notify jobs per G2.4 levels', () => {
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

  it('creating a poll notifies "all" and "mentions_polls" members (not "muted", not sender)', async () => {
    const owner = await createPlayer(pool)
    const memberAll = await createPlayer(pool)
    const memberMentionsPolls = await createPlayer(pool)
    const memberMuted = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    await addMemberWithLevel(pool, group.id, memberAll.id, 'all')
    await addMemberWithLevel(pool, group.id, memberMentionsPolls.id, 'mentions_polls')
    await addMemberWithLevel(pool, group.id, memberMuted.id, 'muted')

    const jobsBefore = (jobQueue as any).jobs.size

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Tonight?', targetTime: new Date().toISOString() })
    expect(res.status).toBe(201)

    const allJobsAfter = Array.from((jobQueue as any).jobs.values()) as any[]
    const newNotifyJobs = allJobsAfter
      .slice(jobsBefore)
      .filter((j: any) => j.name === 'messaging.notify')

    // Should notify memberAll and memberMentionsPolls but NOT muted, NOT sender (owner)
    const notifiedIds = newNotifyJobs.map((j: any) => j.id)
    expect(notifiedIds.some((id: string) => id.includes(memberAll.id))).toBe(true)
    expect(notifiedIds.some((id: string) => id.includes(memberMentionsPolls.id))).toBe(true)
    expect(notifiedIds.some((id: string) => id.includes(memberMuted.id))).toBe(false)
    expect(notifiedIds.some((id: string) => id.includes(owner.id))).toBe(false)
  })
})

// ── Suite D: §0.5 Contract Test — anonymizePollVotesFor ──────────────────────

describe('G3.1 — §0.5 CONTRACT: anonymizePollVotesFor removes A votes, B+tally intact, idempotent', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('anonymizePollVotesFor(A) removes A vote, B vote + tally stay correct, re-run is no-op', async () => {
    const pollRepo = new PollRepository(pool)

    // Seed two players directly
    const playerRepo = new PlayerRepository(pool)
    const playerA = await playerRepo.findOrCreatePlayerByEmail(
      `poll-dsr-A-${uid()}@test.local`,
      `Player A ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    const playerB = await playerRepo.findOrCreatePlayerByEmail(
      `poll-dsr-B-${uid()}@test.local`,
      `Player B ${uid()}`,
      undefined,
      undefined,
      defaultAdultAttestation()
    )

    // Create a group and add both
    const groupRes = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`DSR Poll Group ${uid()}`, playerA.id]
    )
    const groupId = groupRes.rows[0].id
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'member')`,
      [groupId, playerA.id, groupId, playerB.id]
    )

    // Create a poll (type=poll message) directly via PollRepository
    const { pollId, messageId } = await pollRepo.createPoll({
      groupId,
      creatorPlayerId: playerA.id,
      question: 'DSR test poll?',
      targetTime: new Date(),
    })

    expect(pollId).toBeTruthy()
    expect(messageId).toBeTruthy()

    // Cast votes: A=in, B=out
    await pollRepo.castVote({ pollId, playerId: playerA.id, choice: 'in' })
    await pollRepo.castVote({ pollId, playerId: playerB.id, choice: 'out' })

    // Verify pre-anonymization state
    const beforeVotes = await pollRepo.getVotes(pollId)
    expect(beforeVotes.votes).toHaveLength(2)
    expect(beforeVotes.tally).toEqual({ in: 1, out: 1, maybe: 0 })

    // ── THE CONTRACT ──
    await pollRepo.anonymizePollVotesFor(playerA.id)

    // A's vote is gone / tombstoned
    const afterVotes = await pollRepo.getVotes(pollId)
    const aVotes = afterVotes.votes.filter(v => v.playerId === playerA.id)
    expect(aVotes).toHaveLength(0) // removed entirely

    // B's vote is intact
    const bVotes = afterVotes.votes.filter(v => v.playerId === playerB.id)
    expect(bVotes).toHaveLength(1)
    expect(bVotes[0].choice).toBe('out')

    // Tally is recomputed correctly without A
    expect(afterVotes.tally).toEqual({ in: 0, out: 1, maybe: 0 })

    // ── IDEMPOTENT — re-run must not change anything ──
    await pollRepo.anonymizePollVotesFor(playerA.id)

    const idempotentVotes = await pollRepo.getVotes(pollId)
    expect(idempotentVotes.votes).toHaveLength(1) // still just B
    expect(idempotentVotes.votes[0].playerId).toBe(playerB.id)
    expect(idempotentVotes.tally).toEqual({ in: 0, out: 1, maybe: 0 })
  })
})
