/**
 * B4.1 — propose_poll tool (RED first)
 *
 * Draft-time validation: question required, targetTime/autoCloseAt (when
 * given) must be a valid future ISO-UTC instant — the model resolves NL
 * times itself using the askerTimezone/currentDateTime context (B-Q6), this
 * tool only checks the result. Success posts a card via the B1 repository
 * with route-ready args (createPoll's exact input shape).
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, GroupRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { buildAssistantToolContext } from '../../assistant/tools'
import { proposePoll } from '../../assistant/propose-poll'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('propose_poll (B4.1)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let cardRepo: AssistantCardRepository
  let asker: { id: string; name: string }
  let playerGroupId: string

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    cardRepo = new AssistantCardRepository(pool)

    const email = `asker-${uid()}@test.local`
    const name = `Asker ${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    asker = { id: p.id, name: p.name ?? name }

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Poll Group ${uid()}`, asker.id]
    )
    playerGroupId = g.rows[0].id as string
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('happy path: posts a card with route-ready createPoll args', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const targetTime = new Date(Date.now() + 3600_000).toISOString()

    const result = await proposePoll(ctx, { question: 'In for tonight?', targetTime })
    expect(result.status).toBe('card_posted')
    if (result.status !== 'card_posted') return

    const card = await cardRepo.getCard(result.cardId)
    expect(card?.action).toBe('propose_poll')
    expect(card?.proposerPlayerId).toBe(asker.id)
    expect(card?.args).toMatchObject({ question: 'In for tonight?', targetTime })

    const msgRow = await pool.query(`SELECT body FROM messaging.group_messages WHERE id = $1`, [card?.messageId])
    expect(msgRow.rows[0].body).toContain('In for tonight?')
    expect(msgRow.rows[0].body).toContain(asker.name)
  })

  it('declined: empty question posts no card', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposePoll(ctx, { question: '   ' })
    expect(result.status).toBe('declined')
  })

  it('declined: a targetTime in the past is rejected', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposePoll(ctx, {
      question: 'Yesterday session?',
      targetTime: new Date(Date.now() - 3600_000).toISOString(),
    })
    expect(result.status).toBe('declined')
  })

  it('declined: a malformed targetTime is rejected', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposePoll(ctx, { question: 'Not a date test', targetTime: 'not-a-date' })
    expect(result.status).toBe('declined')
  })

  it('a poll without a targetTime is allowed (open-ended poll)', async () => {
    const ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
    const result = await proposePoll(ctx, { question: 'Anyone free this week?' })
    expect(result.status).toBe('card_posted')
  })
})
