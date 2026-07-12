/**
 * B2.1 — propose_score tool (RED first)
 *
 * Draft-time validation as the asker: match pending, score format valid
 * (via the existing parseScore), deadline open. Ambiguity (multiple pending
 * matches vs the same name, or none) returns a structured result and posts
 * NO card — never a guess (design §11 B-Q7 / B0). On success, normalizes
 * the asker-relative score to the player1-relative form the score route
 * expects (B0 "Score frame") and posts a card via the B1 repository, with
 * ids-only args (B-Q10 — no opponent name in args).
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, GroupRepository, TournamentRepository } from '../../db'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { buildAssistantToolContext } from '../../assistant/tools'
import { proposeScore } from '../../assistant/propose-score'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { BroadcastBus } from '../../broadcast-bus'
import { ConversationRepository } from '../../repositories/conversation-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('propose_score (B2.1)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tournamentRepo: TournamentRepository
  let cardRepo: AssistantCardRepository

  let asker: { id: string; name: string }
  let bob: { id: string; name: string }
  let carol: { id: string; name: string }
  let playerGroupId: string

  async function createPlayer(prefix: string): Promise<{ id: string; name: string }> {
    const email = `${prefix}-${uid()}@test.local`
    const name = `${prefix}-${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { id: p.id, name: p.name ?? name }
  }

  /** Create a group-linked tournament with a round-robin group over the roster. */
  async function createTournamentWithRoster(roster: string[]): Promise<string> {
    const t = await TournamentFactory.create(pool, `organizer_${uid()}`)
    await tournamentRepo.updateStatus(t.id, 'group_stage_active')
    await pool.query(`UPDATE public.tournaments SET group_id = $1 WHERE id = $2`, [playerGroupId, t.id])
    for (const playerId of roster) {
      await playerRepo.createRegistration(playerId, t.id)
    }
    await groupRepo.createGroups(t.id, 1, 2, roster)
    return t.id
  }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
    cardRepo = new AssistantCardRepository(pool)

    asker = await createPlayer('asker')
    bob = await createPlayer('bob')
    carol = await createPlayer('carol')

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Score Group ${uid()}`, asker.id]
    )
    playerGroupId = g.rows[0].id as string
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('happy path: posts a card with a player1-relative normalized score; args are ids-only', async () => {
    const tournamentId = await createTournamentWithRoster([asker.id, bob.id])
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })

    const matches = await groupRepo.findMatchesByPlayer(tournamentId, asker.id)
    const match = matches[0]
    const askerIsPlayer1 = match.player1_id === asker.id

    // Valid best-of-3 tennis score (parseScore requires a completed match: 2 set-wins)
    const result = await proposeScore(ctx, { opponentName: bob.name, score: '6-4, 6-3' })
    expect(result.status).toBe('card_posted')
    if (result.status !== 'card_posted') return

    const card = await cardRepo.getCard(result.cardId)
    expect(card?.action).toBe('propose_score')
    expect(card?.proposerPlayerId).toBe(asker.id)
    expect(card?.args).toMatchObject({ tournamentId, matchId: match.id })
    // normalized to player1-relative: each set's numbers swap if the asker is player2
    expect(card?.args.score).toBe(askerIsPlayer1 ? '6-4, 6-3' : '4-6, 3-6')

    // ids-only: opponent's name never appears in the stored args
    expect(JSON.stringify(card?.args)).not.toContain(bob.name)

    // body is a human-readable summary naming both real players
    const msgRow = await pool.query(`SELECT body FROM messaging.group_messages WHERE id = $1`, [card?.messageId])
    expect(msgRow.rows[0].body).toContain(asker.name)
    expect(msgRow.rows[0].body).toContain(bob.name)
  })

  it('emits a message.created SSE event for the card so it appears live (not just on next fetch)', async () => {
    const heidi = await createPlayer('Heidi')
    await createTournamentWithRoster([asker.id, heidi.id])
    const bus = new BroadcastBus()
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId, broadcastBus: bus })

    const conversationRepo = new ConversationRepository(pool)
    const conversationId = await conversationRepo.resolveGroupConversation(playerGroupId)
    const received: Array<{ event: string; data: any }> = []
    bus.subscribe(conversationId, (event, data) => received.push({ event, data }))

    const result = await proposeScore(ctx, { opponentName: heidi.name, score: '6-4, 6-3' })
    expect(result.status).toBe('card_posted')
    if (result.status !== 'card_posted') return

    const createdEvents = received.filter(e => e.event === 'message.created')
    expect(createdEvents).toHaveLength(1)
    expect(createdEvents[0].data).toMatchObject({
      id: result.messageId,
      type: 'assistant',
      cardId: result.cardId,
      cardAction: 'propose_score',
      cardStatus: 'pending',
      cardProposerPlayerId: asker.id,
    })
    expect(createdEvents[0].data.cardExpiresAt).toBeTruthy()
  })

  it('normalizes correctly regardless of which side the asker sits on', async () => {
    // Run twice with two different opponents so at least one orientation is exercised
    // each way across the two seeded tournaments (round-robin seeding order is random).
    const t1 = await createTournamentWithRoster([asker.id, carol.id])
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const matches = await groupRepo.findMatchesByPlayer(t1, asker.id)
    const match = matches[0]
    const askerIsPlayer2 = match.player2_id === asker.id

    const result = await proposeScore(ctx, { opponentName: carol.name, score: '6-2, 6-1' })
    expect(result.status).toBe('card_posted')
    if (result.status !== 'card_posted') return
    const card = await cardRepo.getCard(result.cardId)
    expect(card?.args.score).toBe(askerIsPlayer2 ? '2-6, 1-6' : '6-2, 6-1')
  })

  it('ambiguous: two pending matches whose opponent name matches the query → no card, candidates returned', async () => {
    const dave = await createPlayer('Dave')
    const davina = await createPlayer('Davina') // name collision on substring "Dav"
    const t1 = await createTournamentWithRoster([asker.id, dave.id])
    const t2 = await createTournamentWithRoster([asker.id, davina.id])
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    void t1
    void t2

    const result = await proposeScore(ctx, { opponentName: 'Dav', score: '2-0' })
    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') return
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('not_found: no pending match against that name', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposeScore(ctx, { opponentName: `Nobody ${uid()}`, score: '2-0' })
    expect(result.status).toBe('not_found')
  })

  it('not_found: a match that is already completed is not offered as a candidate', async () => {
    const erin = await createPlayer('Erin')
    const tournamentId = await createTournamentWithRoster([asker.id, erin.id])
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const matches = await groupRepo.findMatchesByPlayer(tournamentId, asker.id)
    await groupRepo.updateMatch(matches[0].id, asker.id, '2-0')

    const result = await proposeScore(ctx, { opponentName: erin.name, score: '2-1' })
    expect(result.status).toBe('not_found')
  })

  it('declined: an invalid score format posts no card', async () => {
    const frank = await createPlayer('Frank')
    await createTournamentWithRoster([asker.id, frank.id])
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })

    const result = await proposeScore(ctx, { opponentName: frank.name, score: 'not-a-score' })
    expect(result.status).toBe('declined')
  })

  it('declined: deadline has already passed for a scheduled tournament', async () => {
    const grace = await createPlayer('Grace')
    const t = await TournamentFactory.create(pool, `organizer_${uid()}`)
    await pool.query(`UPDATE public.tournaments SET group_id = $1 WHERE id = $2`, [playerGroupId, t.id])
    await pool.query(
      `UPDATE public.tournaments SET group_stage_deadline = now() - interval '1 day' WHERE id = $1`,
      [t.id]
    )
    await tournamentRepo.updateStatus(t.id, 'group_stage_active')
    await playerRepo.createRegistration(asker.id, t.id)
    await playerRepo.createRegistration(grace.id, t.id)
    await groupRepo.createGroups(t.id, 1, 2, [asker.id, grace.id])

    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposeScore(ctx, { opponentName: grace.name, score: '2-0' })
    expect(result.status).toBe('declined')
  })
})
