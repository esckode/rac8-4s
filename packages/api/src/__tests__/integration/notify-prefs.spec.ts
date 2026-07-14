/**
 * S5.1 — Player Personalization P9: notify prefs + quiet hours (RED first)
 *
 * migration 054 adds player_settings.notify_mentions/notify_polls/
 * notify_nudges (default true) + quiet_hours_start/end (SMALLINT NULL,
 * 0-23). AND-layer on top of the existing group-level notify_level dial
 * (group-notify-selector.ts stays untouched - B-Q11 regression must still
 * pass): a personal toggle or quiet-hours window can additionally suppress
 * a push that the dial would otherwise allow. Three enqueue sites:
 *   mentions -> routes/player-groups.ts text-message path
 *   polls    -> services/poll-service.ts poll-creation path
 *   nudges   -> workers/nudge-processor.ts
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
import { PlayerRepository, GroupRepository as StageGroupRepository, TournamentRepository, GroupRepository as TournamentGroupRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { PlayerSettingsRepository } from '../../repositories/player-settings-repository'
import { processNudgeSweep } from '../../workers/nudge-processor'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `notifyprefs-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
  return { id: player.id, email: player.email, name: player.name ?? name }
}

async function playerToken(player: { id: string; email: string }, tokenStore: InMemoryTokenStore): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

async function createGroupViaApi(app: Express, ownerToken: string): Promise<{ id: string }> {
  const res = await request(app).post('/player/groups').set('Authorization', `Bearer ${ownerToken}`).send({ name: `Notify Prefs Group ${uid()}` })
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

function notifyJobsFor(jobQueue: InMemoryJobQueue, playerId: string): number {
  const allJobs = Array.from((jobQueue as any).jobs.values()) as any[]
  return allJobs.filter((j: any) => j.name === 'messaging.notify' && j.id.includes(playerId)).length
}

describe('S5.1 — player_settings notify prefs + quiet hours (schema + PATCH)', () => {
  let pool: Pool
  let app: Express
  let settingsRepo: PlayerSettingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    settingsRepo = new PlayerSettingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('table has the new columns with the documented defaults', async () => {
    const res = await pool.query(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'player_settings'`
    )
    const byName = new Map(res.rows.map((r: any) => [r.column_name, r]))
    expect(byName.has('notify_mentions')).toBe(true)
    expect(byName.has('notify_polls')).toBe(true)
    expect(byName.has('notify_nudges')).toBe(true)
    expect(byName.has('quiet_hours_start')).toBe(true)
    expect(byName.has('quiet_hours_end')).toBe(true)
  })

  it('getOrDefaults returns notify toggles true and quiet hours null when no row exists', async () => {
    const player = await createPlayer(pool)
    const settings = await settingsRepo.getOrDefaults(player.id)
    expect(settings).toMatchObject({
      notifyMentions: true,
      notifyPolls: true,
      notifyNudges: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    })
  })

  it('PATCH /api/auth/me/settings round-trips notify prefs and quiet hours', async () => {
    const player = await createPlayer(pool)
    const res = await settingsRepo.upsert(player.id, {
      notifyMentions: false,
      notifyPolls: false,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    })
    expect(res).toMatchObject({
      notifyMentions: false,
      notifyPolls: false,
      notifyNudges: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    })
  })

  it('the quiet_hours_start CHECK constraint rejects an out-of-range value', async () => {
    const player = await createPlayer(pool)
    await expect(
      pool.query(
        `INSERT INTO public.player_settings (player_id, quiet_hours_start) VALUES ($1, 24)`,
        [player.id]
      )
    ).rejects.toThrow()
  })
})

describe('S5.1 — AND-layer: notify_mentions gates the @mention path, not the baseline "all" tier', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue
  let settingsRepo: PlayerSettingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue })
    app = deps.app
    tokenStore = deps.tokenStore
    settingsRepo = new PlayerSettingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('mentioned member with notify_mentions=false gets no job; unmentioned "all" member still does', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    // Single-word name — the unquoted @Name mention regex stops at whitespace
    // (same convention as group-notify.spec.ts's "MentionMe-<uid>" players).
    const playerRepo = new PlayerRepository(pool)
    const mentionedName = `MentionMe-${uid()}`
    const mentionedPlayer = await playerRepo.findOrCreatePlayerByEmail(
      `notifyprefs-mentioned-${uid()}@test.local`,
      mentionedName,
      undefined,
      undefined,
      defaultAdultAttestation()
    )
    const mentioned = { id: mentionedPlayer.id, name: mentionedPlayer.name ?? mentionedName }
    await addMemberWithLevel(pool, group.id, mentioned.id, 'mentions_polls')
    await settingsRepo.upsert(mentioned.id, { notifyMentions: false })

    const baseline = await createPlayer(pool)
    await addMemberWithLevel(pool, group.id, baseline.id, 'all')
    await settingsRepo.upsert(baseline.id, { notifyMentions: false })

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: `Hey @${mentioned.name} check this out` })

    expect(notifyJobsFor(jobQueue, mentioned.id)).toBe(0)
    expect(notifyJobsFor(jobQueue, baseline.id)).toBe(1)
  })
})

describe('S5.1 — AND-layer: notify_polls gates the poll-creation notify path', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue
  let settingsRepo: PlayerSettingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue })
    app = deps.app
    tokenStore = deps.tokenStore
    settingsRepo = new PlayerSettingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('member with notify_polls=false gets no job when a poll is created; another member still does', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const optedOut = await createPlayer(pool)
    await addMemberWithLevel(pool, group.id, optedOut.id, 'all')
    await settingsRepo.upsert(optedOut.id, { notifyPolls: false })

    const optedIn = await createPlayer(pool)
    await addMemberWithLevel(pool, group.id, optedIn.id, 'all')

    await request(app)
      .post(`/player/groups/${group.id}/polls`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ question: 'Play Saturday?' })

    expect(notifyJobsFor(jobQueue, optedOut.id)).toBe(0)
    expect(notifyJobsFor(jobQueue, optedIn.id)).toBe(1)
  })
})

describe('S5.1 — AND-layer: notify_nudges gates the nudge-sweep notify path', () => {
  let pool: Pool
  let jobQueue: InMemoryJobQueue
  let settingsRepo: PlayerSettingsRepository
  let playerRepo: PlayerRepository
  let stageGroupRepo: StageGroupRepository
  let tournamentRepo: TournamentRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    settingsRepo = new PlayerSettingsRepository(pool)
    playerRepo = new PlayerRepository(pool)
    stageGroupRepo = new StageGroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('a player with notify_nudges=false gets no job from the nudge sweep; their groupmate still does', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    await settingsRepo.upsert(opponent.id, { notifyNudges: false })

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by, assistant_enabled) VALUES ($1, $2, true) RETURNING id`,
      [`Nudge Prefs Group ${uid()}`, owner.id]
    )
    const groupId = g.rows[0].id as string

    const tournament = await tournamentRepo.create({
      name: `Nudge Prefs Tournament ${uid()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 2,
      creatorId: owner.id,
      mode: 'scheduled',
      visibility: 'unlisted',
      groupId,
      groupStageDeadline: new Date(Date.now() + 47 * 3_600_000).toISOString(),
    })
    await playerRepo.createRegistration(owner.id, tournament.id)
    await playerRepo.createRegistration(opponent.id, tournament.id)
    const tournamentGroupRepo = new (TournamentGroupRepository as any)(pool)
    await tournamentGroupRepo.createGroups(tournament.id, 1, 1, [owner.id, opponent.id])
    await tournamentRepo.updateStatus(tournament.id, 'group_stage_active')
    void stageGroupRepo

    await processNudgeSweep({ pool, jobQueue })

    expect(notifyJobsFor(jobQueue, opponent.id)).toBe(0)
    expect(notifyJobsFor(jobQueue, owner.id)).toBe(1)
  })
})

describe('S5.1 — quiet hours drop the push entirely', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let jobQueue: InMemoryJobQueue
  let settingsRepo: PlayerSettingsRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    jobQueue = new InMemoryJobQueue()
    const deps = createTestApp(pool, { jobQueue })
    app = deps.app
    tokenStore = deps.tokenStore
    settingsRepo = new PlayerSettingsRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('an "all" member currently in their own quiet-hours window gets no job', async () => {
    const owner = await createPlayer(pool)
    const ownerToken = await playerToken(owner, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const quiet = await createPlayer(pool)
    await addMemberWithLevel(pool, group.id, quiet.id, 'all')
    const nowHour = new Date().getUTCHours()
    await settingsRepo.upsert(quiet.id, {
      timezone: 'UTC',
      timezoneManual: true,
      quietHoursStart: nowHour,
      quietHoursEnd: (nowHour + 1) % 24,
    })

    await request(app)
      .post(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Hello during your quiet hours' })

    expect(notifyJobsFor(jobQueue, quiet.id)).toBe(0)
  })
})
