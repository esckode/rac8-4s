/**
 * G4.5 — Group → Tournament launch from poll
 *
 * RED tests (TDD): written FIRST; will fail until:
 *   1. CreateTournamentInput extended with optional deadlines + mode/visibility/groupId.
 *   2. TournamentRepository.create updated to handle optional deadlines + new fields.
 *   3. POST /player/groups/:groupId/polls/:messageId/launch route implemented.
 *
 * Suites:
 *   A. Happy path — 201, tournament has mode=casual/visibility=unlisted/group_id, In-voter registered
 *   B. System message — type=system message with tournament ID appears after launch
 *   C. Non-creator gets 403
 *   D. Unauthenticated gets 401
 *   E. No In-voters — creates tournament with 0 registrations
 *   F. matchFormat override — body matchFormat overrides group default
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
import { PollRepository } from '../../repositories/poll-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `glaunch-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email,
    name,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, email: player.email, name: player.name ?? name }
}

async function playerToken(
  player: { id: string; email: string },
  tokenStore: InMemoryTokenStore
): Promise<string> {
  const session = await generatePlayerSession(
    {
      playerId: player.id,
      tournamentId: crypto.randomUUID(),
      email: player.email,
      createdAt: Date.now(),
    },
    3600,
    tokenStore
  )
  return session.token
}

async function createGroupViaApi(
  app: Express,
  ownerToken: string,
  defaultMatchFormat?: 'singles' | 'doubles'
): Promise<{ id: string }> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `Launch Test Group ${uid()}`, defaultMatchFormat })
  expect(res.status).toBe(201)
  return { id: res.body.id }
}

async function addMember(pool: Pool, groupId: string, playerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (group_id, player_id) DO NOTHING`,
    [groupId, playerId]
  )
}

async function createPoll(
  pool: Pool,
  groupId: string,
  creatorPlayerId: string
): Promise<{ pollId: string; messageId: string }> {
  const pollRepo = new PollRepository(pool)
  const result = await pollRepo.createPoll({
    groupId,
    creatorPlayerId,
    question: `Are you in for tonight? ${uid()}`,
    targetTime: null,
  })
  return { pollId: result.pollId, messageId: result.messageId }
}

async function castVote(
  pool: Pool,
  pollId: string,
  playerId: string,
  choice: 'in' | 'out' | 'maybe'
): Promise<void> {
  const pollRepo = new PollRepository(pool)
  await pollRepo.castVote({ pollId, playerId, choice })
}

// ── Suite A: Happy path ───────────────────────────────────────────────────────

describe('G4.5 — launch: happy path (201, casual/unlisted, In-voter registered)', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('returns 201 with tournamentId, tournament is casual/unlisted, In-voter registered', async () => {
    const creator = await createPlayer(pool)
    const inVoter = await createPlayer(pool)
    const creatorToken = await playerToken(creator, tokenStore)

    const group = await createGroupViaApi(app, creatorToken, 'singles')
    await addMember(pool, group.id, inVoter.id)

    const { pollId, messageId } = await createPoll(pool, group.id, creator.id)
    await castVote(pool, pollId, inVoter.id, 'in')

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      tournamentId: expect.any(String),
      tournamentName: expect.any(String),
      registeredPlayerIds: expect.arrayContaining([inVoter.id]),
    })

    // Verify tournament has correct mode/visibility/group_id/status in DB
    const tournamentRes = await pool.query(
      `SELECT mode, visibility, group_id, status FROM public.tournaments WHERE id = $1`,
      [res.body.tournamentId]
    )
    expect(tournamentRes.rows[0]).toMatchObject({
      mode: 'casual',
      visibility: 'unlisted',
      group_id: group.id,
      status: 'registration_closed',
    })

    // Verify In-voter is registered
    const regRes = await pool.query(
      `SELECT player_id FROM public.player_registrations WHERE tournament_id = $1 AND player_id = $2`,
      [res.body.tournamentId, inVoter.id]
    )
    expect(regRes.rows).toHaveLength(1)
  })
})

// ── Suite B: System message posted ───────────────────────────────────────────

describe('G4.5 — launch: system message contains tournament ID', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('after launch, a system message appears in group conversation referencing the tournament ID', async () => {
    const creator = await createPlayer(pool)
    const creatorToken = await playerToken(creator, tokenStore)

    const group = await createGroupViaApi(app, creatorToken, 'singles')
    const { messageId } = await createPoll(pool, group.id, creator.id)

    const launchRes = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})

    expect(launchRes.status).toBe(201)
    const tournamentId = launchRes.body.tournamentId

    // Query for the system message
    const msgRes = await pool.query(
      `SELECT gm.body, gm.type
       FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.group_id = $1 AND gm.type = 'system' AND gm.body LIKE $2`,
      [group.id, `%${tournamentId}%`]
    )
    expect(msgRes.rows.length).toBeGreaterThanOrEqual(1)
    expect(msgRes.rows[0].type).toBe('system')
  })
})

// ── Suite C: Non-creator gets 403 ─────────────────────────────────────────────

describe('G4.5 — launch: non-creator gets 403', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('a group member who is not the poll creator gets 403', async () => {
    const creator = await createPlayer(pool)
    const otherMember = await createPlayer(pool)
    const creatorToken = await playerToken(creator, tokenStore)
    const otherToken = await playerToken(otherMember, tokenStore)

    const group = await createGroupViaApi(app, creatorToken)
    await addMember(pool, group.id, otherMember.id)

    const { messageId } = await createPoll(pool, group.id, creator.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({})

    expect(res.status).toBe(403)
  })
})

// ── Suite D: Unauthenticated gets 401 ────────────────────────────────────────

describe('G4.5 — launch: unauthenticated gets 401', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('no auth header → 401', async () => {
    const creator = await createPlayer(pool)
    const creatorToken = await playerToken(creator, tokenStore)

    const group = await createGroupViaApi(app, creatorToken)
    const { messageId } = await createPoll(pool, group.id, creator.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/launch`)
      .send({})

    expect(res.status).toBe(401)
  })
})

// ── Suite E: No In-voters ─────────────────────────────────────────────────────

describe('G4.5 — launch: 0 In-voters still creates tournament', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('when no players voted in, creates tournament with 0 registrations (maxPlayers=1)', async () => {
    const creator = await createPlayer(pool)
    const creatorToken = await playerToken(creator, tokenStore)

    const group = await createGroupViaApi(app, creatorToken)
    const { messageId } = await createPoll(pool, group.id, creator.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})

    expect(res.status).toBe(201)
    expect(res.body.registeredPlayerIds).toHaveLength(0)

    const regRes = await pool.query(
      `SELECT COUNT(*) as count FROM public.player_registrations WHERE tournament_id = $1`,
      [res.body.tournamentId]
    )
    expect(Number(regRes.rows[0].count)).toBe(0)
  })
})

// ── Suite F: matchFormat override ─────────────────────────────────────────────

describe('G4.5 — launch: matchFormat override in body', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('body { matchFormat: "doubles" } overrides singles group default', async () => {
    const creator = await createPlayer(pool)
    const creatorToken = await playerToken(creator, tokenStore)

    const group = await createGroupViaApi(app, creatorToken, 'singles')
    const { messageId } = await createPoll(pool, group.id, creator.id)

    const res = await request(app)
      .post(`/player/groups/${group.id}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ matchFormat: 'doubles' })

    expect(res.status).toBe(201)

    const tournamentRes = await pool.query(
      `SELECT match_format FROM public.tournaments WHERE id = $1`,
      [res.body.tournamentId]
    )
    expect(tournamentRes.rows[0].match_format).toBe('doubles')
  })
})
