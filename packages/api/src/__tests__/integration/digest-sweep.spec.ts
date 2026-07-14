/**
 * C5.1 — Digest sweep (T3.2) integration tests (RED first)
 * S2.5/S2.6 — Personalization P1b digest rework: hourly sweep gated on
 * ~Sunday 09:00 in the group's effective timezone (owner pin > member
 * majority), falling back to Sunday 18:00 UTC when no effective tz exists.
 *
 * processDigestSweep(deps): opted-in groups (assistant_enabled AND
 * digest_enabled) get a weekly digest when at least one section has
 * content; an empty week is skipped; a non-opted-in group never gets one.
 * Weekly dedupe via an iso-week metadata marker.
 *
 * Plan: assets/planning/LLM_ASSISTANT_IMPLEMENTATION.md §C5, §S2.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, TournamentRepository, GroupRepository as StageGroupRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { processDigestSweep } from '../../workers/digest-processor'
import { PlayerSettingsRepository } from '../../repositories/player-settings-repository'

// A known Sunday, 18:00 UTC — the legacy fallback window for groups with no
// derivable effective timezone (verified via Date.getUTCDay() === 0).
const SUNDAY_1800_UTC = new Date('2026-07-12T18:00:00Z')

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `digest-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
  return { id: player.id, name: player.name ?? name }
}

async function createChatGroup(
  pool: Pool,
  ownerId: string,
  opts: { digestEnabled?: boolean; assistantEnabled?: boolean } = {}
): Promise<string> {
  const { digestEnabled = true, assistantEnabled = true } = opts
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by, digest_enabled, assistant_enabled)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`digest-grp-${uid()}`, ownerId, digestEnabled, assistantEnabled]
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, ownerId]
  )
  return groupId
}

async function createTournamentWithResult(
  pool: Pool,
  chatGroupId: string,
  players: Array<{ id: string; name: string }>
): Promise<string> {
  const tournamentRepo = new TournamentRepository(pool)
  const playerRepo = new PlayerRepository(pool)
  const stageGroupRepo = new StageGroupRepository(pool)

  const tournament = await tournamentRepo.create({
    name: `Digest Test ${uid()}`,
    sport: 'tennis',
    matchFormat: 'singles',
    maxPlayers: players.length,
    creatorId: players[0].id,
    mode: 'scheduled',
    visibility: 'unlisted',
    groupId: chatGroupId,
  })
  await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
  for (const p of players) {
    await playerRepo.createRegistration(p.id, tournament.id)
  }
  const stageGroups = await stageGroupRepo.createGroups(tournament.id, 1, 1, players.map(p => p.id))
  const matches = await stageGroupRepo.findMatchesByGroup(stageGroups[0].id)
  for (const m of matches) {
    await stageGroupRepo.updateMatch(m.id, m.player1_id!, '6-3 6-4')
  }
  return tournament.id
}

function isoWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

async function digestRows(pool: Pool, chatGroupId: string, marker: string): Promise<Array<{ body: string }>> {
  const res = await pool.query(
    `SELECT gm.body FROM messaging.group_messages gm
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE c.group_id = $1 AND gm.type = 'assistant' AND gm.metadata->>'nudge' = $2`,
    [chatGroupId, marker]
  )
  return res.rows
}

let pool: Pool

describe('processDigestSweep', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('opted-in group with activity gets one digest', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await createTournamentWithResult(pool, chatGroupId, [owner, opponent])

    const now = SUNDAY_1800_UTC
    await processDigestSweep({ pool, now })

    const marker = `digest:${chatGroupId}:${isoWeek(now)}`
    const rows = await digestRows(pool, chatGroupId, marker)
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain(owner.name)
  })

  it('an empty week (no results, no pending, no deadline) is skipped', async () => {
    const owner = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    // No tournaments at all — nothing to report.

    const now = SUNDAY_1800_UTC
    await processDigestSweep({ pool, now })

    const marker = `digest:${chatGroupId}:${isoWeek(now)}`
    expect(await digestRows(pool, chatGroupId, marker)).toHaveLength(0)
  })

  it('a group with the assistant enabled but NOT opted into digest never gets one', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id, { digestEnabled: false })
    await createTournamentWithResult(pool, chatGroupId, [owner, opponent])

    const now = SUNDAY_1800_UTC
    await processDigestSweep({ pool, now })

    const marker = `digest:${chatGroupId}:${isoWeek(now)}`
    expect(await digestRows(pool, chatGroupId, marker)).toHaveLength(0)
  })

  it('digest_enabled=true but assistant_enabled=false never gets one (master toggle wins)', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id, { assistantEnabled: false })
    await createTournamentWithResult(pool, chatGroupId, [owner, opponent])

    const now = SUNDAY_1800_UTC
    await processDigestSweep({ pool, now })

    const marker = `digest:${chatGroupId}:${isoWeek(now)}`
    expect(await digestRows(pool, chatGroupId, marker)).toHaveLength(0)
  })

  it('sweeping twice in the same iso-week posts only once', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await createTournamentWithResult(pool, chatGroupId, [owner, opponent])

    const now = SUNDAY_1800_UTC
    await processDigestSweep({ pool, now })
    await processDigestSweep({ pool, now })

    const marker = `digest:${chatGroupId}:${isoWeek(now)}`
    expect(await digestRows(pool, chatGroupId, marker)).toHaveLength(1)
  })

  it('posts at ~09:00 in the group-derived effective timezone, not the UTC fallback hour', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await createTournamentWithResult(pool, chatGroupId, [owner, opponent])

    // Both members in America/Los_Angeles (UTC-7 in July) → majority-derived
    // effective tz. Local 09:00 on this Sunday = 16:00 UTC (not 18:00).
    const settingsRepo = new PlayerSettingsRepository(pool)
    await settingsRepo.upsert(owner.id, { timezone: 'America/Los_Angeles' })
    await settingsRepo.upsert(opponent.id, { timezone: 'America/Los_Angeles' })
    await pool.query(`INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`, [
      chatGroupId,
      opponent.id,
    ])

    const localWindow = new Date('2026-07-12T16:00:00Z')
    await processDigestSweep({ pool, now: localWindow })

    const marker = `digest:${chatGroupId}:${isoWeek(localWindow)}`
    expect(await digestRows(pool, chatGroupId, marker)).toHaveLength(1)
  })

  it('does not post outside the group-effective-tz window even on the right day', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await createTournamentWithResult(pool, chatGroupId, [owner, opponent])

    const settingsRepo = new PlayerSettingsRepository(pool)
    await settingsRepo.upsert(owner.id, { timezone: 'America/Los_Angeles' })
    await settingsRepo.upsert(opponent.id, { timezone: 'America/Los_Angeles' })
    await pool.query(`INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`, [
      chatGroupId,
      opponent.id,
    ])

    // Same Sunday, but the group's own effective-tz window (16:00 UTC) has
    // not arrived yet — the legacy 18:00 UTC fallback must NOT apply since
    // this group DOES have an effective timezone.
    const outsideWindow = new Date('2026-07-12T10:00:00Z')
    await processDigestSweep({ pool, now: outsideWindow })

    const marker = `digest:${chatGroupId}:${isoWeek(outsideWindow)}`
    expect(await digestRows(pool, chatGroupId, marker)).toHaveLength(0)
  })
})
