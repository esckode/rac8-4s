/**
 * P3.5 — Launch system-message deep-link metadata (RED tests)
 *
 * Tests:
 *   1. schema: messaging.group_messages has a metadata JSONB column
 *   2. manual launch (POST /launch) stores { tournament_id } in metadata on the system message
 *   3. GET /messages history returns metadata on system messages
 *   4. auto-launch (processAutoCloseSweep) stores { tournament_id } in metadata
 *   5. non-launch system messages have metadata = null
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
import { processAutoCloseSweep } from '../../workers/auto-close-processor'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `dl-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email, name, undefined, undefined, defaultAdultAttestation(),
  )
  return { id: player.id, email: player.email, name: player.name ?? name }
}

async function playerToken(
  player: { id: string; email: string },
  tokenStore: InMemoryTokenStore,
): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore,
  )
  return session.token
}

async function createGroupViaApi(app: Express, ownerToken: string): Promise<string> {
  const res = await request(app)
    .post('/player/groups')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `DL ${uid()}` })
  expect(res.status).toBe(201)
  return res.body.id as string
}

async function createPollInGroup(
  pool: Pool,
  groupId: string,
  creatorId: string,
  autoLaunch = false,
): Promise<{ messageId: string; conversationId: string }> {
  const convRes = await pool.query(
    `INSERT INTO messaging.conversations (type, group_id)
     VALUES ('group', $1)
     ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [groupId],
  )
  let conversationId: string
  if (convRes.rows.length > 0) {
    conversationId = convRes.rows[0].id as string
  } else {
    const sel = await pool.query(`SELECT id FROM messaging.conversations WHERE group_id = $1`, [groupId])
    conversationId = sel.rows[0].id as string
  }
  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, $2, 'Creator', 'Are you in?', 'poll') RETURNING id`,
    [conversationId, creatorId],
  )
  const messageId = msgRes.rows[0].id as string
  const pastDue = new Date(Date.now() - 60_000)
  await pool.query(
    `INSERT INTO messaging.polls (message_id, question, creator_player_id, auto_close_at, auto_launch, min_players)
     VALUES ($1, 'Are you in?', $2, $3, $4, 1)`,
    [messageId, creatorId, pastDue, autoLaunch],
  )
  return { messageId, conversationId }
}

let pool: Pool
let app: Express
let tokenStore: InMemoryTokenStore

describe('P3.5 — Deep-link metadata on launch system messages', () => {
  // Nested one level inside the describe (rather than at file top-level) so this
  // afterAll runs — and releases the suite connection — before the global afterAll
  // in setup.ts calls closeTestPool(). Same-scope afterAll hooks run in registration
  // order, so a top-level afterAll here would race the global one and pool.end()
  // would hang forever waiting for this still-checked-out client.
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

  it('schema: messaging.group_messages has a metadata JSONB column', async () => {
    const res = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'messaging' AND table_name = 'group_messages' AND column_name = 'metadata'`,
    )
    expect(res.rows.length).toBe(1)
    expect(res.rows[0].data_type).toBe('jsonb')
  })

  it('manual launch: system message carries structured { tournament_id } metadata', async () => {
    const creator = await createPlayer(pool)
    const voter = await createPlayer(pool)
    const ownerToken = await playerToken(creator, tokenStore)
    const groupId = await createGroupViaApi(app, ownerToken)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, voter.id],
    )

    const { messageId, conversationId } = await createPollInGroup(pool, groupId, creator.id, false)
    await pool.query(
      `INSERT INTO messaging.poll_votes (message_id, player_id, choice) VALUES ($1, $2, 'in')`,
      [messageId, voter.id],
    )

    const launchRes = await request(app)
      .post(`/player/groups/${groupId}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})

    expect(launchRes.status).toBe(201)
    const tournamentId = launchRes.body.tournamentId as string

    const sysMsgRes = await pool.query(
      `SELECT metadata FROM messaging.group_messages
       WHERE conversation_id = $1 AND type = 'system'
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    )
    expect(sysMsgRes.rows.length).toBeGreaterThan(0)
    const meta = sysMsgRes.rows[0].metadata as { tournament_id: string } | null
    expect(meta).not.toBeNull()
    expect(meta!.tournament_id).toBe(tournamentId)
  })

  it('GET /messages history returns metadata field on system messages', async () => {
    const creator = await createPlayer(pool)
    const voter = await createPlayer(pool)
    const ownerToken = await playerToken(creator, tokenStore)
    const groupId = await createGroupViaApi(app, ownerToken)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, voter.id],
    )

    const { messageId } = await createPollInGroup(pool, groupId, creator.id, false)
    await pool.query(
      `INSERT INTO messaging.poll_votes (message_id, player_id, choice) VALUES ($1, $2, 'in')`,
      [messageId, voter.id],
    )

    const launchRes = await request(app)
      .post(`/player/groups/${groupId}/polls/${messageId}/launch`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
    expect(launchRes.status).toBe(201)
    const tournamentId = launchRes.body.tournamentId as string

    const historyRes = await request(app)
      .get(`/player/groups/${groupId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
    expect(historyRes.status).toBe(200)

    const sysMsg = (historyRes.body.messages as any[]).find(
      (m: any) => m.type === 'system' && m.metadata?.tournament_id === tournamentId,
    )
    expect(sysMsg).toBeDefined()
    expect(sysMsg.metadata.tournament_id).toBe(tournamentId)
  })

  it('auto-launch: system message carries { tournament_id } metadata', async () => {
    const creator = await createPlayer(pool)
    const groupId = await createGroupViaApi(app, await playerToken(creator, tokenStore))

    const { messageId, conversationId } = await createPollInGroup(pool, groupId, creator.id, true)
    await pool.query(
      `INSERT INTO messaging.poll_votes (message_id, player_id, choice) VALUES ($1, $2, 'in')`,
      [messageId, creator.id],
    )

    await processAutoCloseSweep({ pool })

    const tournamentRes = await pool.query(
      `SELECT id FROM public.tournaments WHERE group_id = $1`,
      [groupId],
    )
    expect(tournamentRes.rows.length).toBe(1)
    const tournamentId = tournamentRes.rows[0].id as string

    const sysMsgRes = await pool.query(
      `SELECT metadata FROM messaging.group_messages
       WHERE conversation_id = $1 AND type = 'system' AND metadata IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    )
    expect(sysMsgRes.rows.length).toBeGreaterThan(0)
    const meta = sysMsgRes.rows[0].metadata as { tournament_id: string }
    expect(meta.tournament_id).toBe(tournamentId)
  })

  it('non-launch system messages have metadata = null', async () => {
    const creator = await createPlayer(pool)
    const ownerToken = await playerToken(creator, tokenStore)
    const groupId = await createGroupViaApi(app, ownerToken)
    const voter = await createPlayer(pool)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, voter.id],
    )

    // Promote emits a system message (role event — no tournament)
    await request(app)
      .post(`/player/groups/${groupId}/members/${voter.id}/promote`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)

    await new Promise<void>(resolve => setImmediate(resolve))

    const conversationRes = await pool.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId],
    )
    const conversationId = conversationRes.rows[0].id as string

    const roleMsgRes = await pool.query(
      `SELECT metadata FROM messaging.group_messages
       WHERE conversation_id = $1 AND type = 'system'`,
      [conversationId],
    )
    expect(roleMsgRes.rows.length).toBeGreaterThan(0)
    for (const row of roleMsgRes.rows) {
      expect(row.metadata).toBeNull()
    }
  })
})
