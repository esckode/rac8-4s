/**
 * B4.1 — propose_poll_vote tool (RED first)
 *
 * Draft-time validation: choice must be in/out/maybe; the poll is resolved
 * from a natural-language question fragment against open polls in the
 * group (mirrors propose_score's opponent-name matching) — ambiguity/none
 * post no card (B-Q7). A closed poll is never offered as a candidate.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { buildAssistantToolContext } from '../../assistant/tools'
import { proposePollVote } from '../../assistant/propose-poll-vote'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { PollRepository } from '../../repositories/poll-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('propose_poll_vote (B4.1)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let pollRepo: PollRepository
  let cardRepo: AssistantCardRepository
  let asker: { id: string; name: string }
  let playerGroupId: string

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    pollRepo = new PollRepository(pool)
    cardRepo = new AssistantCardRepository(pool)

    const email = `voter-${uid()}@test.local`
    const name = `Voter ${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    asker = { id: p.id, name: p.name ?? name }

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Vote Group ${uid()}`, asker.id]
    )
    playerGroupId = g.rows[0].id as string
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('happy path: posts a card resolving the single matching open poll', async () => {
    const poll = await pollRepo.createPoll({
      groupId: playerGroupId,
      creatorPlayerId: asker.id,
      question: 'Saturday morning session?',
    })
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })

    const result = await proposePollVote(ctx, { pollQuestion: 'Saturday morning', choice: 'in' })
    expect(result.status).toBe('card_posted')
    if (result.status !== 'card_posted') return

    const card = await cardRepo.getCard(result.cardId)
    expect(card?.action).toBe('propose_poll_vote')
    expect(card?.args).toMatchObject({ pollId: poll.pollId, choice: 'in' })
  })

  it('declined: an invalid choice posts no card', async () => {
    await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: asker.id, question: 'Invalid choice test poll?' })
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposePollVote(ctx, { pollQuestion: 'Invalid choice test', choice: 'yes' as any })
    expect(result.status).toBe('declined')
  })

  it('not_found: no open poll matches the question fragment', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposePollVote(ctx, { pollQuestion: `Nonexistent poll ${uid()}`, choice: 'in' })
    expect(result.status).toBe('not_found')
  })

  it('ambiguous: two open polls match the fragment → no card, candidates returned', async () => {
    const tag = uid()
    await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: asker.id, question: `Weekend session ${tag} (option A)?` })
    await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: asker.id, question: `Weekend session ${tag} (option B)?` })
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })

    const result = await proposePollVote(ctx, { pollQuestion: `Weekend session ${tag}`, choice: 'in' })
    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') return
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('a closed poll is never offered as a candidate', async () => {
    const tag = uid()
    const poll = await pollRepo.createPoll({ groupId: playerGroupId, creatorPlayerId: asker.id, question: `Closed poll ${tag}?` })
    await pollRepo.closePoll(poll.messageId, playerGroupId, asker.id)
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })

    const result = await proposePollVote(ctx, { pollQuestion: `Closed poll ${tag}`, choice: 'in' })
    expect(result.status).toBe('not_found')
  })
})
