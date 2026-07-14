/**
 * S4.1 — Player Personalization P5: `GET /api/auth/me/pending-actions` (RED first)
 *
 * Aggregates four already-existing facts, caller-scoped: my unscored matches,
 * open polls in my groups I haven't voted in, my own pending assistant cards
 * (only the proposer can act on one — B-Q2), and the nearest deadline across
 * my registered tournaments. Read-only — no new state, no logging (CLAUDE.md
 * §6: reads stay silent).
 *
 * Scenario (11) — the auth-wall negative test: player B's items must never
 * appear in player A's payload.
 */

import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import bcryptjs from 'bcryptjs'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { AccountRepository, PlayerRepository, GroupRepository, TournamentRepository } from '../../db'
import { PollRepository } from '../../repositories/poll-repository'
import { AssistantCardRepository } from '../../repositories/assistant-card-repository'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

let pool: Pool
let app: Express
let accountRepo: AccountRepository
let playerRepo: PlayerRepository
let groupRepo: GroupRepository
let tournamentRepo: TournamentRepository
let pollRepo: PollRepository
let cardRepo: AssistantCardRepository

async function loginAndGetToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`)
  return res.body.token as string
}

async function createLinkedAccountToken(): Promise<{ token: string; playerId: string; email: string }> {
  const email = `pending-${uid()}@test.local`
  const password = 'testpassword123'

  const player = await playerRepo.findOrCreatePlayerByEmail(
    email,
    `Player ${uid()}`,
    undefined,
    undefined,
    defaultAdultAttestation()
  )

  const account = await accountRepo.create(email, 'player')
  const passwordHash = await bcryptjs.hash(password, 10)
  await accountRepo.updatePasswordHash(account.id, passwordHash)
  await accountRepo.linkPlayer(account.id, player.id)

  const token = await loginAndGetToken(email, password)
  return { token, playerId: player.id, email }
}

async function createBarePlayer(): Promise<{ id: string; name: string }> {
  const name = `Player ${uid()}`
  const player = await playerRepo.findOrCreatePlayerByEmail(
    `pending-${uid()}@test.local`,
    name,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, name: player.name ?? name }
}

async function createPlayerGroup(createdBy: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`Pending Actions Group ${uid()}`, createdBy]
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, createdBy]
  )
  return groupId
}

async function addMember(groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
    [groupId, playerId]
  )
}

/** Create a tournament with a single round-robin group over the roster (unscored match seeded). */
async function createTournamentWithRoster(
  roster: string[],
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const t = await TournamentFactory.create(pool, roster[0], overrides)
  await tournamentRepo.updateStatus(t.id, 'group_stage_active')
  for (const playerId of roster) {
    await playerRepo.createRegistration(playerId, t.id)
  }
  await groupRepo.createGroups(t.id, 1, 2, roster)
  return t.id
}

describe('S4.1 — GET /api/auth/me/pending-actions', () => {
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    accountRepo = new AccountRepository(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)
    pollRepo = new PollRepository(pool)
    cardRepo = new AssistantCardRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/auth/me/pending-actions')
    expect(res.status).toBe(401)
  })

  it('returns empty arrays and a null nearestDeadline when nothing is pending', async () => {
    const { token } = await createLinkedAccountToken()

    const res = await request(app).get('/api/auth/me/pending-actions').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      unscoredMatches: [],
      openPolls: [],
      pendingCards: [],
      nearestDeadline: null,
    })
  })

  it('lists my unscored matches', async () => {
    const { token, playerId } = await createLinkedAccountToken()
    const opponent = await createBarePlayer()
    const tournamentId = await createTournamentWithRoster([playerId, opponent.id])

    const res = await request(app).get('/api/auth/me/pending-actions').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.unscoredMatches).toHaveLength(1)
    expect(res.body.unscoredMatches[0]).toMatchObject({
      tournamentId,
      opponentName: opponent.name,
    })
  })

  it('lists open polls in my groups I have not voted in, excluding ones I voted in', async () => {
    const { token, playerId } = await createLinkedAccountToken()
    const groupId = await createPlayerGroup(playerId)

    const unvoted = await pollRepo.createPoll({ groupId, creatorPlayerId: playerId, question: 'Play Saturday?' })
    const voted = await pollRepo.createPoll({ groupId, creatorPlayerId: playerId, question: 'Play Sunday?' })
    await pollRepo.castVote({ pollId: voted.pollId, playerId, choice: 'in' })

    const res = await request(app).get('/api/auth/me/pending-actions').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.openPolls).toHaveLength(1)
    expect(res.body.openPolls[0]).toMatchObject({ pollId: unvoted.pollId, question: 'Play Saturday?' })
  })

  it('lists my own pending assistant cards, not cards proposed by someone else', async () => {
    const { token, playerId } = await createLinkedAccountToken()
    const groupId = await createPlayerGroup(playerId)
    const other = await createBarePlayer()
    await addMember(groupId, other.id)

    const mine = await cardRepo.createCard({
      groupId,
      proposerPlayerId: playerId,
      action: 'propose_score',
      args: {},
      body: 'Report 6-4, 6-3?',
    })
    await cardRepo.createCard({
      groupId,
      proposerPlayerId: other.id,
      action: 'propose_score',
      args: {},
      body: 'Report 6-2, 6-1?',
    })

    const res = await request(app).get('/api/auth/me/pending-actions').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.pendingCards).toHaveLength(1)
    expect(res.body.pendingCards[0]).toMatchObject({ cardId: mine.card.id, action: 'propose_score' })
  })

  it('computes the nearest deadline across my tournaments', async () => {
    const { token, playerId } = await createLinkedAccountToken()
    const opponent = await createBarePlayer()

    const soon = new Date(Date.now() + 3_600_000).toISOString() // +1h
    const later = new Date(Date.now() + 7_200_000).toISOString() // +2h
    const nearTournamentId = await createTournamentWithRoster([playerId, opponent.id], { groupStageDeadline: soon })
    await createTournamentWithRoster([playerId, opponent.id], { groupStageDeadline: later })

    const res = await request(app).get('/api/auth/me/pending-actions').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.nearestDeadline).toMatchObject({ tournamentId: nearTournamentId })
  })

  it('NEGATIVE — player B\'s items never appear in player A\'s payload', async () => {
    const a = await createLinkedAccountToken()
    const b = await createLinkedAccountToken()
    const opponent = await createBarePlayer()

    // B has an unscored match, an open poll, and a pending card of their own.
    await createTournamentWithRoster([b.playerId, opponent.id])
    const bGroupId = await createPlayerGroup(b.playerId)
    await pollRepo.createPoll({ groupId: bGroupId, creatorPlayerId: b.playerId, question: 'B poll' })
    await cardRepo.createCard({
      groupId: bGroupId,
      proposerPlayerId: b.playerId,
      action: 'propose_score',
      args: {},
      body: 'B card',
    })

    const res = await request(app).get('/api/auth/me/pending-actions').set('Authorization', `Bearer ${a.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      unscoredMatches: [],
      openPolls: [],
      pendingCards: [],
    })
  })
})
