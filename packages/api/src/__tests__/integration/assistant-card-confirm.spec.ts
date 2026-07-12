/**
 * B2.3 — Confirm/cancel routes for assistant cards (RED first)
 *
 * POST /player/groups/:groupId/assistant-cards/:cardId/confirm
 * POST /player/groups/:groupId/assistant-cards/:cardId/cancel
 *
 * Mutate-first, then flip (design §11 B-Q3): confirm calls the EXISTING
 * score-service.ts submitScore() as the confirming player — the same code
 * path the normal score route uses — then atomically flips the card.
 * Server revalidation is the authority; draft-time validation was only UX.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { BroadcastBus } from '../../broadcast-bus'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository, GroupRepository, TournamentRepository } from '../../db'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { PollRepository } from '../../repositories/poll-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('Confirm/cancel routes for assistant cards (B2.3)', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let bus: BroadcastBus
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tournamentRepo: TournamentRepository
  let cardRepo: AssistantCardRepository
  let conversationRepo: ConversationRepository
  let pollRepo: PollRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    bus = new BroadcastBus()
    const deps = createTestApp(pool, { broadcastBus: bus })
    app = deps.app
    tokenStore = deps.tokenStore
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
    cardRepo = new AssistantCardRepository(pool)
    conversationRepo = new ConversationRepository(pool as any)
    pollRepo = new PollRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function createPlayer(prefix: string): Promise<{ id: string; name: string; email: string }> {
    const email = `${prefix}-${uid()}@test.local`
    const name = `${prefix}-${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { id: p.id, name: p.name ?? name, email: p.email }
  }

  async function token(playerId: string, email: string): Promise<string> {
    const session = await generatePlayerSession(
      { playerId, tournamentId: crypto.randomUUID(), email, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return session.token
  }

  async function createGroupWithMembers(ownerId: string, memberIds: string[]): Promise<string> {
    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Confirm Group ${uid()}`, ownerId]
    )
    const groupId = g.rows[0].id as string
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
      [groupId, ownerId]
    )
    for (const memberId of memberIds) {
      await pool.query(
        `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
        [groupId, memberId]
      )
    }
    return groupId
  }

  /** Group-linked scheduled tournament with a pending 1v1 match. */
  async function seedPendingMatch(groupId: string, playerA: string, playerB: string) {
    const t = await TournamentFactory.create(pool, `organizer_${uid()}`)
    await pool.query(`UPDATE public.tournaments SET group_id = $1 WHERE id = $2`, [groupId, t.id])
    await tournamentRepo.updateStatus(t.id, 'group_stage_active')
    await playerRepo.createRegistration(playerA, t.id)
    await playerRepo.createRegistration(playerB, t.id)
    await groupRepo.createGroups(t.id, 1, 2, [playerA, playerB])
    const matches = await groupRepo.findMatchesByPlayer(t.id, playerA)
    return { tournamentId: t.id, matchId: matches[0].id, match: matches[0] }
  }

  async function createScoreCard(
    groupId: string,
    proposerId: string,
    tournamentId: string,
    matchId: string,
    score: string,
    opts: { expiresInSeconds?: number } = {}
  ) {
    const { card } = await cardRepo.createCard({
      groupId,
      proposerPlayerId: proposerId,
      action: 'propose_score',
      args: { tournamentId, matchId, score },
      body: 'Coach drafted a score.',
      expiresInSeconds: opts.expiresInSeconds ?? 900,
    })
    return card
  }

  it('happy path: proposer confirms → mutates via the real score service, card confirmed, card.updated emitted', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id])
    const { tournamentId, matchId, match } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const askerIsPlayer1 = match.player1_id === alice.id
    const score = askerIsPlayer1 ? '6-4, 6-3' : '4-6, 3-6'
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, score)

    const conversationId = await conversationRepo.resolveGroupConversation(groupId)
    const received: Array<{ event: string; data: unknown }> = []
    bus.subscribe(conversationId, (event, data) => received.push({ event, data }))

    const aliceToken = await token(alice.id, alice.email)
    const res = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.card.status).toBe('confirmed')

    const reread = await cardRepo.getCard(card.id)
    expect(reread?.status).toBe('confirmed')

    const matchRow = await groupRepo.findMatchById(matchId)
    expect(matchRow?.status).toBe('completed')

    const updateEvents = received.filter(e => e.event === 'card.updated')
    expect(updateEvents).toHaveLength(1)
    expect(updateEvents[0].data).toMatchObject({ cardId: card.id, status: 'confirmed' })
  })

  it('non-proposer group member → 403, card untouched', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const bystander = await createPlayer('Bystander')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id, bystander.id])
    const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')

    const bystanderToken = await token(bystander.id, bystander.email)
    const res = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${bystanderToken}`)
      .send({})

    expect(res.status).toBe(403)
    expect((await cardRepo.getCard(card.id))?.status).toBe('pending')
  })

  it('a member outside the group entirely → 403', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const outsider = await createPlayer('Outsider')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id])
    const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')

    const outsiderToken = await token(outsider.id, outsider.email)
    const res = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({})

    expect(res.status).toBe(403)
  })

  it('expired card → 409, never mutates the match', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id])
    const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3', { expiresInSeconds: -1 })

    const aliceToken = await token(alice.id, alice.email)
    const res = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({})

    expect(res.status).toBe(409)
    const matchRow = await groupRepo.findMatchById(matchId)
    expect(matchRow?.status).toBe('pending')
  })

  it('already confirmed → a second confirm 409s', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id])
    const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')
    const aliceToken = await token(alice.id, alice.email)

    const first = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({})
    expect(first.status).toBe(200)

    const second = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({})
    expect(second.status).toBe(409)
  })

  it('schema_version mismatch → 409, card untouched', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id])
    const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')
    const aliceToken = await token(alice.id, alice.email)

    const res = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ schemaVersion: 999 })

    expect(res.status).toBe(409)
    expect((await cardRepo.getCard(card.id))?.status).toBe('pending')
  })

  it('confirm after the match was already scored elsewhere → card flips to failed, no double score', async () => {
    const alice = await createPlayer('Alice')
    const sunil = await createPlayer('Sunil')
    const groupId = await createGroupWithMembers(alice.id, [sunil.id])
    const { tournamentId, matchId, match } = await seedPendingMatch(groupId, alice.id, sunil.id)
    const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')

    // Someone else scores the match through the normal path before the card is confirmed
    await groupRepo.updateMatch(matchId, match.player1_id!, '6-2, 6-2')

    const conversationId = await conversationRepo.resolveGroupConversation(groupId)
    const received: Array<{ event: string; data: unknown }> = []
    bus.subscribe(conversationId, (event, data) => received.push({ event, data }))

    const aliceToken = await token(alice.id, alice.email)
    const res = await request(app)
      .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.card.status).toBe('failed')
    expect(res.body.card.result?.reason).toBeTruthy()

    // The original (correct) score is untouched — no double-score
    const matchRow = await groupRepo.findMatchById(matchId)
    expect(matchRow?.score).toBe('6-2, 6-2')

    const updateEvents = received.filter(e => e.event === 'card.updated')
    expect(updateEvents).toHaveLength(1)
    expect(updateEvents[0].data).toMatchObject({ cardId: card.id, status: 'failed' })
  })

  describe('cancel', () => {
    it('proposer cancels a pending card → cancelled, card.updated emitted', async () => {
      const alice = await createPlayer('Alice')
      const sunil = await createPlayer('Sunil')
      const groupId = await createGroupWithMembers(alice.id, [sunil.id])
      const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
      const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')

      const conversationId = await conversationRepo.resolveGroupConversation(groupId)
      const received: Array<{ event: string; data: unknown }> = []
      bus.subscribe(conversationId, (event, data) => received.push({ event, data }))

      const aliceToken = await token(alice.id, alice.email)
      const res = await request(app)
        .post(`/player/groups/${groupId}/assistant-cards/${card.id}/cancel`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('cancelled')
      expect((await cardRepo.getCard(card.id))?.status).toBe('cancelled')

      const updateEvents = received.filter(e => e.event === 'card.updated')
      expect(updateEvents).toHaveLength(1)
      expect(updateEvents[0].data).toMatchObject({ cardId: card.id, status: 'cancelled' })

      // The match was never mutated by a cancelled card
      const matchRow = await groupRepo.findMatchById(matchId)
      expect(matchRow?.status).toBe('pending')
    })

    it('non-proposer cannot cancel → 403', async () => {
      const alice = await createPlayer('Alice')
      const sunil = await createPlayer('Sunil')
      const groupId = await createGroupWithMembers(alice.id, [sunil.id])
      const { tournamentId, matchId } = await seedPendingMatch(groupId, alice.id, sunil.id)
      const card = await createScoreCard(groupId, alice.id, tournamentId, matchId, '6-4, 6-3')

      const sunilToken = await token(sunil.id, sunil.email)
      const res = await request(app)
        .post(`/player/groups/${groupId}/assistant-cards/${card.id}/cancel`)
        .set('Authorization', `Bearer ${sunilToken}`)
        .send({})

      expect(res.status).toBe(403)
      expect((await cardRepo.getCard(card.id))?.status).toBe('pending')
    })
  })

  // ── B4.1 — propose_poll / propose_poll_vote confirm dispatch ─────────────────

  describe('propose_poll confirm', () => {
    it('confirms via the real poll-service, creates the poll, card confirmed', async () => {
      const alice = await createPlayer('Alice')
      const groupId = await createGroupWithMembers(alice.id, [])
      const { card } = await cardRepo.createCard({
        groupId,
        proposerPlayerId: alice.id,
        action: 'propose_poll',
        args: { question: 'In for tonight?', targetTime: null, autoCloseAt: null, autoLaunch: false, minPlayers: null, launchMatchFormat: null },
        body: 'Coach drafted a poll.',
      })

      const aliceToken = await token(alice.id, alice.email)
      const res = await request(app)
        .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('confirmed')

      const history = await pollRepo.findOpenPollsByGroup(groupId)
      expect(history.some(p => p.question === 'In for tonight?')).toBe(true)
    })

    it('declined question (business-rule rejection at confirm time) → card flips to failed', async () => {
      const alice = await createPlayer('Alice')
      const groupId = await createGroupWithMembers(alice.id, [])
      const { card } = await cardRepo.createCard({
        groupId,
        proposerPlayerId: alice.id,
        action: 'propose_poll',
        args: { question: '   ', targetTime: null, autoCloseAt: null, autoLaunch: false, minPlayers: null, launchMatchFormat: null },
        body: 'Coach drafted a poll.',
      })

      const aliceToken = await token(alice.id, alice.email)
      const res = await request(app)
        .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('failed')
    })
  })

  describe('propose_poll_vote confirm', () => {
    it('confirms via the real poll-service, casts the vote, card confirmed', async () => {
      const alice = await createPlayer('Alice')
      const groupId = await createGroupWithMembers(alice.id, [])
      const poll = await pollRepo.createPoll({ groupId, creatorPlayerId: alice.id, question: 'Saturday?' })
      const { card } = await cardRepo.createCard({
        groupId,
        proposerPlayerId: alice.id,
        action: 'propose_poll_vote',
        args: { pollId: poll.pollId, choice: 'in' },
        body: 'Coach drafted a vote.',
      })

      const aliceToken = await token(alice.id, alice.email)
      const res = await request(app)
        .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('confirmed')

      const votes = await pollRepo.getVotes(poll.pollId)
      expect(votes.tally.in).toBe(1)
    })

    it('confirm on a poll closed after drafting → card flips to failed, no vote cast', async () => {
      const alice = await createPlayer('Alice')
      const groupId = await createGroupWithMembers(alice.id, [])
      const poll = await pollRepo.createPoll({ groupId, creatorPlayerId: alice.id, question: 'Sunday?' })
      const { card } = await cardRepo.createCard({
        groupId,
        proposerPlayerId: alice.id,
        action: 'propose_poll_vote',
        args: { pollId: poll.pollId, choice: 'in' },
        body: 'Coach drafted a vote.',
      })
      await pollRepo.closePoll(poll.messageId, groupId, alice.id)

      const aliceToken = await token(alice.id, alice.email)
      const res = await request(app)
        .post(`/player/groups/${groupId}/assistant-cards/${card.id}/confirm`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.card.status).toBe('failed')

      const votes = await pollRepo.getVotes(poll.pollId)
      expect(votes.tally.in).toBe(0)
    })
  })
})
