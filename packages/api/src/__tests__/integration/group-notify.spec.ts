/**
 * G2.4 — Integration tests: group chat message enqueues messaging.notify
 *         jobs respecting each recipient's notify_level.
 *
 * TDD: written RED-first. Will fail until the route wires up the selector
 *       and enqueues per-recipient notify jobs.
 *
 * Uses InMemoryJobQueue — no Redis required.
 * Uses getTestPool() transactional harness — all DB changes rolled back.
 *
 * Suites:
 *   A. text message → only 'all' recipients get notify jobs
 *   B. @mention in text → 'mentions_polls' recipient also gets a notify job
 *   C. @mention of 'muted' member → no notify job (badge still updates via DB)
 *   D. sender is excluded from notify jobs regardless of their notify_level
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
import { ConversationRepository } from '../../repositories/conversation-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `gnotify-${uid()}@test.local`
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
    .send({ name: `Notify Test Group ${uid()}` })
  expect(res.status).toBe(201)
  return { id: res.body.id }
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

// ── Suite A: text message ─────────────────────────────────────────────────────

describe('G2.4 — group notify: text message enqueues jobs for "all" only', () => {
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

  it('posting a text message enqueues a notify job for "all" members but not "mentions_polls"', async () => {
    const owner = await createPlayer(pool)
    const memberAll = await createPlayer(pool)
    const memberMentions = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    // owner is already 'owner' role with default notify_level 'mentions_polls'
    await addMemberWithLevel(pool, group.id, memberAll.id, 'all')
    await addMemberWithLevel(pool, group.id, memberMentions.id, 'mentions_polls')

    // Snapshot job count before
    const jobsBefore = (jobQueue as any).jobs.size

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Plain text, no mentions' })

    const jobsAfter = (jobQueue as any).jobs.size
    const newJobCount = jobsAfter - jobsBefore

    // Only memberAll should get a notify job
    expect(newJobCount).toBe(1)

    // The job should have been keyed by memberAll's playerId
    const allJobs = Array.from((jobQueue as any).jobs.values()) as any[]
    const newJobs = allJobs.slice(allJobs.length - newJobCount)
    const notifyJobs = newJobs.filter((j: any) => j.name === 'messaging.notify')
    expect(notifyJobs).toHaveLength(1)
    expect(notifyJobs[0].id).toContain(memberAll.id)
  })

  it('posting a text message enqueues NO notify job when no "all" members exist', async () => {
    const owner = await createPlayer(pool)
    const memberMentions = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    // owner has default 'mentions_polls'; add another 'mentions_polls' member
    await addMemberWithLevel(pool, group.id, memberMentions.id, 'mentions_polls')

    const jobsBefore = (jobQueue as any).jobs.size

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Nobody is on "all"' })

    const jobsAfter = (jobQueue as any).jobs.size
    expect(jobsAfter - jobsBefore).toBe(0)
  })

  it('muted member never receives a notify job on text', async () => {
    const owner = await createPlayer(pool)
    const mutedMember = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    await addMemberWithLevel(pool, group.id, mutedMember.id, 'muted')

    const jobsBefore = (jobQueue as any).jobs.size

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Hello silent one' })

    const jobsAfter = (jobQueue as any).jobs.size
    expect(jobsAfter - jobsBefore).toBe(0)
  })
})

// ── Suite B: @mention upgrades "mentions_polls" recipient ─────────────────────

describe('G2.4 — group notify: @mention in text message notifies "mentions_polls" member', () => {
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

  it('@mention of a "mentions_polls" member triggers a notify job for them', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    // Create a player with a known name we can @mention
    const repo = new PlayerRepository(pool)
    const mentionedEmail = `gnotify-mentioned-${uid()}@test.local`
    const mentionedName = `MentionMe-${uid()}`
    const mentioned = await repo.findOrCreatePlayerByEmail(
      mentionedEmail,
      mentionedName,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    await addMemberWithLevel(pool, group.id, mentioned.id, 'mentions_polls')

    const jobsBefore = (jobQueue as any).jobs.size

    // owner (mentions_polls by default) @mentions the member
    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: `Hey @${mentionedName} check this out` })

    const jobsAfter = (jobQueue as any).jobs.size
    const newJobCount = jobsAfter - jobsBefore

    // mentioned member should get a notify job
    expect(newJobCount).toBeGreaterThanOrEqual(1)

    const allJobs = Array.from((jobQueue as any).jobs.values()) as any[]
    const notifyJobs = allJobs.filter((j: any) => j.name === 'messaging.notify' && j.id.includes(mentioned.id))
    expect(notifyJobs).toHaveLength(1)
  })
})

// ── Suite C: @mention of muted member ────────────────────────────────────────

describe('G2.4 — group notify: @mention does NOT notify "muted" member', () => {
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

  it('@mention of a "muted" member produces no notify job', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const repo = new PlayerRepository(pool)
    const mutedEmail = `gnotify-muted-${uid()}@test.local`
    const mutedName = `MutedPlayer-${uid()}`
    const mutedPlayer = await repo.findOrCreatePlayerByEmail(
      mutedEmail,
      mutedName,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    await addMemberWithLevel(pool, group.id, mutedPlayer.id, 'muted')

    const jobsBefore = (jobQueue as any).jobs.size

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: `Hey @${mutedName} you cannot escape!` })

    const jobsAfter = (jobQueue as any).jobs.size
    const newJobCount = jobsAfter - jobsBefore

    // muted member: no notify job (badge/unread still updates via DB — separate concern)
    expect(newJobCount).toBe(0)
  })
})

// ── Suite D: sender is excluded ───────────────────────────────────────────────

describe('G2.4 — group notify: sender excluded from notify jobs', () => {
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

  it('sender with notify_level "all" does not receive a notify job for their own message', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    // Set owner's notify_level to 'all'
    await addMemberWithLevel(pool, group.id, owner.id, 'all')

    // Add another 'all' member so we confirm at least one job is produced
    const other = await createPlayer(pool)
    await addMemberWithLevel(pool, group.id, other.id, 'all')

    const jobsBefore = (jobQueue as any).jobs.size

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'I sent this' })

    const allJobs = Array.from((jobQueue as any).jobs.values()) as any[]
    const newNotifyJobs = allJobs.filter(
      (j: any) => j.name === 'messaging.notify' &&
      !allJobs.slice(0, jobsBefore).includes(j)
    )

    // Sender (owner) should NOT have a notify job; other should
    const ownerJobs = newNotifyJobs.filter((j: any) => j.id.includes(owner.id))
    const otherJobs = newNotifyJobs.filter((j: any) => j.id.includes(other.id))
    expect(ownerJobs).toHaveLength(0)
    expect(otherJobs).toHaveLength(1)
  })
})

// ── Suite E: @mention posts a Notifications Center entry (P2.4) ──────────────

describe('G2.4 — @mention posts a personal-notification-center entry', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue })
    app = deps.app
    tokenStore = deps.tokenStore
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function getPersonalMessages(playerId: string) {
    const convId = await convRepo.resolvePersonalConversation(playerId)
    const res = await pool.query(
      `SELECT * FROM messaging.group_messages WHERE conversation_id = $1 ORDER BY created_at`,
      [convId]
    )
    return res.rows
  }

  it('@mention of a "mentions_polls" member posts a personal notification with groupId metadata', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const repo = new PlayerRepository(pool)
    const mentionedName = `MentionMe-${uid()}`
    const mentioned = await repo.findOrCreatePlayerByEmail(
      `gnotify-mentioned-${uid()}@test.local`,
      mentionedName,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    await addMemberWithLevel(pool, group.id, mentioned.id, 'mentions_polls')

    const before = await getPersonalMessages(mentioned.id)

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: `Hey @${mentionedName} check this out` })

    // postAndBroadcastPersonalNotification is fire-and-forget — allow it to settle.
    await new Promise(r => setTimeout(r, 100))

    const after = await getPersonalMessages(mentioned.id)
    expect(after.length).toBeGreaterThan(before.length)
    const notif = after[after.length - 1]
    expect(notif.type).toBe('system')
    expect(notif.metadata).toMatchObject({ groupId: group.id })
  })

  it('@mention of a "muted" member does NOT post a personal notification', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const repo = new PlayerRepository(pool)
    const mutedName = `MutedPlayer-${uid()}`
    const mutedPlayer = await repo.findOrCreatePlayerByEmail(
      `gnotify-muted-${uid()}@test.local`,
      mutedName,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    await addMemberWithLevel(pool, group.id, mutedPlayer.id, 'muted')

    const before = await getPersonalMessages(mutedPlayer.id)

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: `Hey @${mutedName} you cannot escape!` })

    await new Promise(r => setTimeout(r, 100))

    const after = await getPersonalMessages(mutedPlayer.id)
    expect(after.length).toBe(before.length)
  })

  it('a non-mentioned "all" recipient does NOT get a personal notification (mentions only)', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const other = await createPlayer(pool)
    await addMemberWithLevel(pool, group.id, other.id, 'all')

    const before = await getPersonalMessages(other.id)

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Plain text, no mentions' })

    await new Promise(r => setTimeout(r, 100))

    const after = await getPersonalMessages(other.id)
    expect(after.length).toBe(before.length)
  })
})
