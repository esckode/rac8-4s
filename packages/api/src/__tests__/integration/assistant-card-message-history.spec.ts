/**
 * B3.0 [RED→GREEN] — surface card state on the message history (the poll
 * precedent, group-message-repository.ts getGroupHistory LEFT JOIN
 * messaging.polls, extended to messaging.assistant_cards). The FE ActionCard
 * (B3) needs cardStatus/cardArgs/cardExpiresAt/cardProposerPlayerId inline on
 * the type='assistant' message row it already renders — no separate
 * per-card fetch, and `card.updated` just re-fetches or patches this same
 * shape client-side.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { ConversationRepository } from '../../repositories/conversation-repository'
import { GroupMessageRepository } from '../../repositories/group-message-repository'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `cardhist-${uid()}@test.local`
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
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `Group ${uid()}` })
  return { id: res.body.id as string }
}

describe('B3.0 — card state on message history', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let cardRepo: AssistantCardRepository
  let msgRepo: GroupMessageRepository
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    cardRepo = new AssistantCardRepository(pool)
    msgRepo = new GroupMessageRepository(pool)
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('getGroupHistory includes card fields for a type=assistant message with a card', async () => {
    const proposer = await createPlayer(pool)
    const ownerToken = await playerToken(proposer, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    const conversationId = await convRepo.resolveGroupConversation(group.id)

    const { card } = await cardRepo.createCard({
      groupId: group.id,
      proposerPlayerId: proposer.id,
      action: 'propose_score',
      args: { tournamentId: 't1', matchId: 'm1', score: '6-4, 6-3' },
      body: 'Coach drafted a score — Proposer 6-4, 6-3 Opponent.',
    })

    const history = await msgRepo.getGroupHistory({ conversationId })
    const row = history.find(m => m.id === card.messageId)
    expect(row).toBeDefined()
    expect(row!.type).toBe('assistant')
    expect(row!.cardId).toBe(card.id)
    expect(row!.cardAction).toBe('propose_score')
    expect(row!.cardArgs).toMatchObject({ tournamentId: 't1', matchId: 'm1' })
    expect(row!.cardStatus).toBe('pending')
    expect(row!.cardExpiresAt).toBeInstanceOf(Date)
    expect(row!.cardProposerPlayerId).toBe(proposer.id)
  })

  it('a plain Phase A assistant reply (no card) has no card fields', async () => {
    const proposer = await createPlayer(pool)
    const ownerToken = await playerToken(proposer, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)
    const conversationId = await convRepo.resolveGroupConversation(group.id)

    const { message } = await msgRepo.sendAssistantMessage({
      groupId: group.id,
      body: 'Your next match is Saturday.',
    })

    const history = await msgRepo.getGroupHistory({ conversationId })
    const row = history.find(m => m.id === message.id)
    expect(row).toBeDefined()
    expect(row!.cardId).toBeNull()
  })

  it('GET /player/groups/:groupId/messages surfaces card fields for the proposer', async () => {
    const proposer = await createPlayer(pool)
    const ownerToken = await playerToken(proposer, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { card } = await cardRepo.createCard({
      groupId: group.id,
      proposerPlayerId: proposer.id,
      action: 'propose_score',
      args: { tournamentId: 't1', matchId: 'm1', score: '6-4, 6-3' },
      body: 'Coach drafted a score.',
    })

    const res = await request(app)
      .get(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    const cardMsg = res.body.messages.find((m: any) => m.id === card.messageId)
    expect(cardMsg).toMatchObject({
      cardId: card.id,
      cardAction: 'propose_score',
      cardStatus: 'pending',
      cardProposerPlayerId: proposer.id,
    })
    expect(cardMsg.cardExpiresAt).toBeTruthy()
  })

  it('a confirmed card is reflected in the next GET /messages fetch', async () => {
    const proposer = await createPlayer(pool)
    const ownerToken = await playerToken(proposer, tokenStore)
    const group = await createGroupViaApi(app, ownerToken)

    const { card } = await cardRepo.createCard({
      groupId: group.id,
      proposerPlayerId: proposer.id,
      action: 'propose_score',
      args: { tournamentId: 't1', matchId: 'm1', score: '6-4, 6-3' },
      body: 'Coach drafted a score.',
    })
    await cardRepo.claimCard(card.id, 'confirmed', { ok: true })

    const res = await request(app)
      .get(`/player/groups/${group.id}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)

    const cardMsg = res.body.messages.find((m: any) => m.id === card.messageId)
    expect(cardMsg.cardStatus).toBe('confirmed')
  })
})
