/**
 * C3.1/C3.3 — Nudge sweep (T3.1) integration tests (RED first)
 *
 * processNudgeSweep(deps): scheduled, group-linked tournaments with a
 * group_stage_deadline get a 48h and (independently) a 24h reminder naming
 * their unscored matches. Dedupe via a metadata marker on the assistant
 * message row (no new state table). Targeted messaging.notify enqueue for
 * exactly the players in the named matches, respecting notify_level. The
 * ≤2 proactive posts/group/day cap suppresses further nudges (logged warn).
 *
 * Plan: assets/planning/LLM_ASSISTANT_IMPLEMENTATION.md §C3.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { InMemoryJobQueue } from '@worker/job-queue'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, TournamentRepository, GroupRepository as StageGroupRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { processNudgeSweep } from '../../workers/nudge-processor'
import { addTransport, type LogEntry } from '../../logger'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `nudge-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
  return { id: player.id, name: player.name ?? name }
}

/** Create a chat group (player_groups) + owner membership. */
async function createChatGroup(pool: Pool, ownerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`nudge-grp-${uid()}`, ownerId]
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, ownerId]
  )
  return groupId
}

async function addChatGroupMember(
  pool: Pool,
  groupId: string,
  playerId: string,
  notifyLevel: 'all' | 'mentions_polls' | 'muted' = 'all'
): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role, notify_level) VALUES ($1, $2, 'member', $3)`,
    [groupId, playerId, notifyLevel]
  )
}

/** Seed a scheduled, group-linked singles tournament with a 2-player round-robin stage group. */
async function createDueTournament(
  pool: Pool,
  chatGroupId: string,
  players: Array<{ id: string; name: string }>,
  hoursUntilDeadline: number,
  overrides: { status?: string; matchFormat?: 'singles' | 'doubles' } = {}
): Promise<{ tournamentId: string; stageGroupId: string }> {
  const tournamentRepo = new TournamentRepository(pool)
  const playerRepo = new PlayerRepository(pool)
  const stageGroupRepo = new StageGroupRepository(pool)

  const deadline = new Date(Date.now() + hoursUntilDeadline * 3_600_000)
  const tournament = await tournamentRepo.create({
    name: `Nudge Test ${uid()}`,
    sport: 'tennis',
    matchFormat: overrides.matchFormat ?? 'singles',
    maxPlayers: players.length,
    creatorId: players[0].id,
    mode: 'scheduled',
    visibility: 'unlisted',
    groupId: chatGroupId,
    groupStageDeadline: deadline.toISOString(),
  })
  await tournamentRepo.updateStatus(tournament.id, overrides.status ?? 'registration_closed')

  for (const p of players) {
    await playerRepo.createRegistration(p.id, tournament.id)
  }

  const stageGroups = await stageGroupRepo.createGroups(tournament.id, 1, 1, players.map(p => p.id))
  return { tournamentId: tournament.id, stageGroupId: stageGroups[0].id }
}

async function scoreAllMatches(pool: Pool, stageGroupId: string): Promise<void> {
  const stageGroupRepo = new StageGroupRepository(pool)
  const matches = await stageGroupRepo.findMatchesByGroup(stageGroupId)
  for (const m of matches) {
    await stageGroupRepo.updateMatch(m.id, m.player1_id!, '6-3 6-4')
  }
}

async function nudgeMarkerCount(pool: Pool, chatGroupId: string, marker: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) AS count FROM messaging.group_messages gm
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE c.group_id = $1 AND gm.type = 'assistant' AND gm.metadata->>'nudge' = $2`,
    [chatGroupId, marker]
  )
  return Number(res.rows[0].count)
}

let pool: Pool

describe('processNudgeSweep', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('47h-to-deadline tournament with an unscored match gets a 48h nudge', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)
    const { tournamentId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 47)

    await processNudgeSweep({ pool })

    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline48:${tournamentId}`)).toBe(1)
    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'assistant'`,
      [chatGroupId]
    )
    expect(rows.rows[0].body).toContain(owner.name)
    expect(rows.rows[0].body).toContain(opponent.name)
  })

  it('23h-to-deadline tournament gets a 24h nudge, independent of the 48h one', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)
    const { tournamentId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 23)

    await processNudgeSweep({ pool })

    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline24:${tournamentId}`)).toBe(1)
    // 23h is also <= 48h — but sweeping once should not ALSO skip 48h; both
    // markers get evaluated. Since 23 <= 48, the 48h milestone check would
    // also fire in this same sweep pass unless already marked — assert it
    // does fire (a late sweep still catches an unposted 48h nudge too).
    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline48:${tournamentId}`)).toBe(1)
  })

  it('running the sweep twice posts only once per milestone (idempotent)', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)
    const { tournamentId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 47)

    await processNudgeSweep({ pool })
    await processNudgeSweep({ pool })

    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline48:${tournamentId}`)).toBe(1)
  })

  it('all matches already scored → no nudge', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)
    const { tournamentId, stageGroupId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 47)
    await scoreAllMatches(pool, stageGroupId)

    await processNudgeSweep({ pool })

    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline48:${tournamentId}`)).toBe(0)
  })

  it('assistant disabled for the group → no nudge', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)
    await pool.query(`UPDATE public.player_groups SET assistant_enabled = false WHERE id = $1`, [chatGroupId])
    const { tournamentId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 47)

    await processNudgeSweep({ pool })

    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline48:${tournamentId}`)).toBe(0)
  })

  it('casual tournaments (no deadline) are never nudged', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)

    const tournamentRepo = new TournamentRepository(pool)
    const playerRepo = new PlayerRepository(pool)
    const stageGroupRepo = new StageGroupRepository(pool)
    const tournament = await tournamentRepo.create({
      name: `Casual Nudge Test ${uid()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 2,
      creatorId: owner.id,
      mode: 'casual',
      visibility: 'unlisted',
      groupId: chatGroupId,
      // no groupStageDeadline
    })
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
    await playerRepo.createRegistration(owner.id, tournament.id)
    await playerRepo.createRegistration(opponent.id, tournament.id)
    await stageGroupRepo.createGroups(tournament.id, 1, 1, [owner.id, opponent.id])

    await processNudgeSweep({ pool })

    const rows = await pool.query(
      `SELECT gm.id FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'assistant'`,
      [chatGroupId]
    )
    expect(rows.rows.length).toBe(0)
  })

  it('a non-group-linked tournament is never nudged', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)

    const tournamentRepo = new TournamentRepository(pool)
    const playerRepo = new PlayerRepository(pool)
    const stageGroupRepo = new StageGroupRepository(pool)
    const deadline = new Date(Date.now() + 47 * 3_600_000)
    const tournament = await tournamentRepo.create({
      name: `No Group Nudge Test ${uid()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 2,
      creatorId: owner.id,
      mode: 'scheduled',
      visibility: 'public',
      groupStageDeadline: deadline.toISOString(),
      // no groupId
    })
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
    await playerRepo.createRegistration(owner.id, tournament.id)
    await playerRepo.createRegistration(opponent.id, tournament.id)
    await stageGroupRepo.createGroups(tournament.id, 1, 1, [owner.id, opponent.id])

    // Should not throw despite no group_id, and post nothing anywhere
    await expect(processNudgeSweep({ pool })).resolves.toBeUndefined()
  })

  it('targeted notify: affected players get a job, muted and unaffected members do not', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const unaffected = await createPlayer(pool)
    const muted = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)
    await addChatGroupMember(pool, chatGroupId, unaffected.id)
    await addChatGroupMember(pool, chatGroupId, muted.id, 'muted')
    const { tournamentId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 47)

    const jobQueue = new InMemoryJobQueue()
    await processNudgeSweep({ pool, jobQueue })

    const notifyJobs = jobQueue.getByName('messaging.notify')
    const marker = `deadline48:${tournamentId}`
    expect(await jobQueue.getJob(`notify:${marker}:${owner.id}`)).not.toBeNull()
    expect(await jobQueue.getJob(`notify:${marker}:${opponent.id}`)).not.toBeNull()
    expect(await jobQueue.getJob(`notify:${marker}:${unaffected.id}`)).toBeNull()
    expect(await jobQueue.getJob(`notify:${marker}:${muted.id}`)).toBeNull()
    expect(notifyJobs.length).toBe(2)
  })

  it('cap: a third proactive post in the same day is suppressed and logged at warn', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await addChatGroupMember(pool, chatGroupId, opponent.id)

    // Seed 2 prior proactive posts today to saturate the cap.
    const convRes = await pool.query(
      `INSERT INTO messaging.conversations (type, group_id) VALUES ('group', $1)
       ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING RETURNING id`,
      [chatGroupId]
    )
    const conversationId =
      convRes.rows[0]?.id ??
      (await pool.query(`SELECT id FROM messaging.conversations WHERE group_id = $1`, [chatGroupId])).rows[0].id
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type, metadata)
         VALUES ($1, NULL, 'Coach', 'Prior nudge', 'assistant', $2)`,
        [conversationId, JSON.stringify({ nudge: `deadline48:seed-${uid()}` })]
      )
    }

    const { tournamentId } = await createDueTournament(pool, chatGroupId, [owner, opponent], 47)

    const entries: LogEntry[] = []
    addTransport(e => entries.push(e))

    await processNudgeSweep({ pool })

    expect(await nudgeMarkerCount(pool, chatGroupId, `deadline48:${tournamentId}`)).toBe(0)
    expect(entries.some(e => e.level === 'warn' && e.msg === 'assistant.nudge.suppressed')).toBe(true)
  })
})
