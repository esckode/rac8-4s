/**
 * B5.1 — propose_casual_launch tool (RED first)
 *
 * Draft check mirrors the real launch route's authority (design §11 B-Q8,
 * corrected 2026-07-12): asker must be the referenced poll's CREATOR, not
 * "group owner" as originally assumed — the shipped route
 * (player-groups.ts POST /:groupId/polls/:messageId/launch) authorizes only
 * the poll creator. Anyone else → polite decline, no card. Poll-lookup
 * searches ALL polls (open or closed) — launch has no "must be closed" gate
 * in the real route. Card args carry {pollId, messageId, inVoterNames,
 * defaultFormat} for the FE's LaunchConfirmSheet.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { buildAssistantToolContext } from '../../assistant/tools'
import { proposeCasualLaunch } from '../../assistant/propose-casual-launch'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { PollRepository } from '../../repositories/poll-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('propose_casual_launch (B5.1)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let pollRepo: PollRepository
  let cardRepo: AssistantCardRepository
  let creator: { id: string; name: string }
  let other: { id: string; name: string }
  let playerGroupId: string

  async function createPlayer(prefix: string): Promise<{ id: string; name: string }> {
    const email = `${prefix}-${uid()}@test.local`
    const name = `${prefix}-${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { id: p.id, name: p.name ?? name }
  }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    pollRepo = new PollRepository(pool)
    cardRepo = new AssistantCardRepository(pool)

    creator = await createPlayer('Creator')
    other = await createPlayer('Other')

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Launch Group ${uid()}`, creator.id]
    )
    playerGroupId = g.rows[0].id as string
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('happy path: poll creator drafts a launch card with in-voter names', async () => {
    const poll = await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: creator.id, question: 'Saturday session?' })
    await pollRepo.castVote({ pollId: poll.pollId, playerId: creator.id, choice: 'in' })
    await pollRepo.castVote({ pollId: poll.pollId, playerId: other.id, choice: 'in' })

    const ctx = await buildAssistantToolContext(pool, { playerId: creator.id, groupId: playerGroupId })
    const result = await proposeCasualLaunch(ctx, { pollQuestion: 'Saturday session' })
    expect(result.status).toBe('card_posted')
    if (result.status !== 'card_posted') return

    const card = await cardRepo.getCard(result.cardId)
    expect(card?.action).toBe('propose_casual_launch')
    expect(card?.args).toMatchObject({ pollId: poll.pollId, messageId: poll.messageId })
    expect((card?.args.inVoterNames as string[]).sort()).toEqual([creator.name, other.name].sort())
  })

  it('a launch can be drafted even for an already-closed poll (no closed gate)', async () => {
    const poll = await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: creator.id, question: 'Closed launch test poll?' })
    await pollRepo.closePoll(poll.messageId, playerGroupId, creator.id)
    const ctx = await buildAssistantToolContext(pool, { playerId: creator.id, groupId: playerGroupId })

    const result = await proposeCasualLaunch(ctx, { pollQuestion: 'Closed launch test' })
    expect(result.status).toBe('card_posted')
  })

  it('declined: a non-creator asking to launch gets a polite decline, no card', async () => {
    const poll = await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: creator.id, question: 'Only creator can launch this?' })
    const ctx = await buildAssistantToolContext(pool, { playerId: other.id, groupId: playerGroupId })

    const result = await proposeCasualLaunch(ctx, { pollQuestion: 'Only creator can launch this' })
    expect(result.status).toBe('declined')
  })

  it('not_found: no poll matches the fragment', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: creator.id, groupId: playerGroupId })
    const result = await proposeCasualLaunch(ctx, { pollQuestion: `Nonexistent poll ${uid()}` })
    expect(result.status).toBe('not_found')
  })

  it('ambiguous: two polls (both by the asker) match the fragment → no card, candidates returned', async () => {
    const tag = uid()
    await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: creator.id, question: `Ambiguous launch ${tag} (A)?` })
    await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: creator.id, question: `Ambiguous launch ${tag} (B)?` })
    const ctx = await buildAssistantToolContext(pool, { playerId: creator.id, groupId: playerGroupId })

    const result = await proposeCasualLaunch(ctx, { pollQuestion: `Ambiguous launch ${tag}` })
    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') return
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
  })
})
