/**
 * C4.1 — Recap sweep (T3.3) integration tests (RED first)
 *
 * processRecapSweep(deps): a completed, group-linked tournament with no
 * existing recap marker gets ONE recap naming the winner + top-3 standings.
 * Re-sweeping posts nothing further (idempotent). Template-first: LLM polish
 * only when the adapter is real (not mock) AND daily budget remains; any
 * polish failure falls back to the template — exactly one row posted either
 * way, never silent, never double.
 *
 * Plan: assets/planning/LLM_ASSISTANT_IMPLEMENTATION.md §C4.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, TournamentRepository, GroupRepository as StageGroupRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { processRecapSweep } from '../../workers/recap-processor'
import { MockAssistantClient, type AssistantClient, type AssistantTurnResult } from '../../assistant/assistant-client'
import { AssistantRateLimiter } from '../../assistant/rate-limiter'
import { InMemoryCounterStore } from '../../middleware/rate-limit-store'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `recap-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
  return { id: player.id, name: player.name ?? name }
}

async function createChatGroup(pool: Pool, ownerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`recap-grp-${uid()}`, ownerId]
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, ownerId]
  )
  return groupId
}

async function createCompletedTournament(
  pool: Pool,
  chatGroupId: string,
  players: Array<{ id: string; name: string }>,
  finalStatus: string = 'tournament_complete'
): Promise<{ tournamentId: string; stageGroupId: string }> {
  const tournamentRepo = new TournamentRepository(pool)
  const playerRepo = new PlayerRepository(pool)
  const stageGroupRepo = new StageGroupRepository(pool)

  const tournament = await tournamentRepo.create({
    name: `Recap Test ${uid()}`,
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

  // Score all matches so standings are meaningful.
  const matches = await stageGroupRepo.findMatchesByGroup(stageGroups[0].id)
  for (const m of matches) {
    await stageGroupRepo.updateMatch(m.id, m.player1_id!, '6-3 6-4')
  }

  await tournamentRepo.updateStatus(tournament.id, finalStatus)
  return { tournamentId: tournament.id, stageGroupId: stageGroups[0].id }
}

function recapDeps(pool: Pool, client: AssistantClient, dailyBudgetUsd = 10) {
  return {
    pool,
    client,
    rateLimiter: new AssistantRateLimiter(new InMemoryCounterStore(), {
      playerPerHour: 10,
      groupPerHour: 30,
      dailyBudgetUsd,
    }),
  }
}

async function recapRows(pool: Pool, chatGroupId: string, marker: string): Promise<Array<{ body: string }>> {
  const res = await pool.query(
    `SELECT gm.body FROM messaging.group_messages gm
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE c.group_id = $1 AND gm.type = 'assistant' AND gm.metadata->>'nudge' = $2`,
    [chatGroupId, marker]
  )
  return res.rows
}

/** A client whose runTurn can be scripted per-test (success, throw, empty text). */
class ScriptedAssistantClient implements AssistantClient {
  constructor(private impl: (input: unknown) => Promise<AssistantTurnResult>) {}
  async runTurn(input: any): Promise<AssistantTurnResult> {
    return this.impl(input)
  }
}

let pool: Pool

describe('processRecapSweep', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('completed group-linked tournament gets one recap naming the winner', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [chatGroupId, opponent.id]
    )
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    await processRecapSweep(recapDeps(pool, new MockAssistantClient()))

    const rows = await recapRows(pool, chatGroupId, `recap:${tournamentId}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain(owner.name)
  })

  it('re-sweeping posts no second recap for the same tournament', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [chatGroupId, opponent.id]
    )
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    await processRecapSweep(recapDeps(pool, new MockAssistantClient()))
    await processRecapSweep(recapDeps(pool, new MockAssistantClient()))

    const rows = await recapRows(pool, chatGroupId, `recap:${tournamentId}`)
    expect(rows).toHaveLength(1)
  })

  it('assistant disabled for the group → no recap', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(`UPDATE public.player_groups SET assistant_enabled = false WHERE id = $1`, [chatGroupId])
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    await processRecapSweep(recapDeps(pool, new MockAssistantClient()))

    expect(await recapRows(pool, chatGroupId, `recap:${tournamentId}`)).toHaveLength(0)
  })

  it('a non-group-linked completed tournament is never recapped', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const tournamentRepo = new TournamentRepository(pool)
    const playerRepo = new PlayerRepository(pool)
    const stageGroupRepo = new StageGroupRepository(pool)
    const tournament = await tournamentRepo.create({
      name: `No Group Recap Test ${uid()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 2,
      creatorId: owner.id,
      mode: 'scheduled',
      visibility: 'public',
    })
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
    await playerRepo.createRegistration(owner.id, tournament.id)
    await playerRepo.createRegistration(opponent.id, tournament.id)
    const stageGroups = await stageGroupRepo.createGroups(tournament.id, 1, 1, [owner.id, opponent.id])
    const matches = await stageGroupRepo.findMatchesByGroup(stageGroups[0].id)
    for (const m of matches) await stageGroupRepo.updateMatch(m.id, m.player1_id!, '6-3 6-4')
    await tournamentRepo.updateStatus(tournament.id, 'tournament_complete')

    await expect(processRecapSweep(recapDeps(pool, new MockAssistantClient()))).resolves.toBeUndefined()
  })

  it('adapter mock → template posted, never polished', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [chatGroupId, opponent.id]
    )
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    await processRecapSweep(recapDeps(pool, new MockAssistantClient()))

    const rows = await recapRows(pool, chatGroupId, `recap:${tournamentId}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain('wrapped up')
  })

  it('real adapter + budget remaining → polished body posted', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [chatGroupId, opponent.id]
    )
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    const scripted = new ScriptedAssistantClient(async () => ({
      text: 'Polished recap text!',
      usage: { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 0 },
      toolRounds: 0,
    }))

    await processRecapSweep(recapDeps(pool, scripted))

    const rows = await recapRows(pool, chatGroupId, `recap:${tournamentId}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toBe('Polished recap text!')
  })

  it('real adapter but polish throws → template posted, exactly one row', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [chatGroupId, opponent.id]
    )
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    const scripted = new ScriptedAssistantClient(async () => {
      throw new Error('network blip')
    })

    await processRecapSweep(recapDeps(pool, scripted))

    const rows = await recapRows(pool, chatGroupId, `recap:${tournamentId}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain('wrapped up')
  })

  it('real adapter but budget exhausted → template posted, no polish attempted', async () => {
    const owner = await createPlayer(pool)
    const opponent = await createPlayer(pool)
    const chatGroupId = await createChatGroup(pool, owner.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [chatGroupId, opponent.id]
    )
    const { tournamentId } = await createCompletedTournament(pool, chatGroupId, [owner, opponent])

    let called = false
    const scripted = new ScriptedAssistantClient(async () => {
      called = true
      return { text: 'should not be used', usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 }, toolRounds: 0 }
    })

    await processRecapSweep(recapDeps(pool, scripted, 0))

    const rows = await recapRows(pool, chatGroupId, `recap:${tournamentId}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain('wrapped up')
    expect(called).toBe(false)
  })
})
