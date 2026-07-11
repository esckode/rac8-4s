/**
 * A1 — LLM Assistant (@coach): schema + repository support
 *
 * RED tests (TDD): written FIRST; fail until migration 049 and the two new
 * GroupMessageRepository methods land.
 *
 * Covers:
 *  1. group_messages accepts type='assistant' (049 widens the CHECK)
 *  2. player_groups.assistant_enabled exists and defaults true (049)
 *  3. sendAssistantMessage inserts a Coach row (player_id NULL, snapshot 'Coach')
 *  4. getRecentMessages returns newest-N in chronological order with type + senderName
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { GroupMessageRepository } from '../../repositories/group-message-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    `assist-${uid()}@test.local`,
    name,
    undefined,
    undefined,
    defaultAdultAttestation()
  )
  return { id: player.id, name: player.name ?? name }
}

async function createGroup(pool: Pool, createdBy: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`Assist Group ${uid()}`, createdBy]
  )
  return res.rows[0].id as string
}

describe('assistant schema + repository (migration 049)', () => {
  let pool: Pool
  let repo: GroupMessageRepository

  beforeAll(async () => {
    await beginTransaction()
    pool = await getTestPool()
    repo = new GroupMessageRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it("accepts a group_messages row with type='assistant'", async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)
    const conv = await pool.query(
      `INSERT INTO messaging.conversations (type, group_id) VALUES ('group', $1) RETURNING id`,
      [groupId]
    )
    const conversationId = conv.rows[0].id as string

    const inserted = await pool.query(
      `INSERT INTO messaging.group_messages
         (conversation_id, player_id, sender_name_snapshot, body, type)
       VALUES ($1, NULL, 'Coach', 'hello from coach', 'assistant')
       RETURNING id, type`,
      [conversationId]
    )
    expect(inserted.rows[0].type).toBe('assistant')
  })

  it("accepts a messaging.messages row with type='assistant' (both stores stay consistent)", async () => {
    // messaging.messages is the partitioned tournament store; 049 widens its CHECK too
    // so the type enum never diverges between stores. Constraint-level assertion only.
    const check = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid = 'messaging.messages'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%type%'`
    )
    const defs = check.rows.map((r: { def: string }) => r.def).join(' ')
    expect(defs).toContain('assistant')
  })

  it('player_groups.assistant_enabled exists and defaults to true', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)

    const res = await pool.query(
      `SELECT assistant_enabled FROM public.player_groups WHERE id = $1`,
      [groupId]
    )
    expect(res.rows[0].assistant_enabled).toBe(true)
  })

  it('sendAssistantMessage inserts a Coach row and returns it', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)

    const { message, conversationId } = await repo.sendAssistantMessage({
      groupId,
      body: 'Saturday 9am vs Bob, Court 2.',
    })

    expect(conversationId).toBeTruthy()
    expect(message.playerId).toBeNull()
    expect(message.senderName).toBe('Coach')
    expect(message.type).toBe('assistant')
    expect(message.body).toBe('Saturday 9am vs Bob, Court 2.')
  })

  it('sendAssistantMessage stores optional metadata (replyTo / intro markers)', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)
    const replyTo = crypto.randomUUID()

    const { message } = await repo.sendAssistantMessage({
      groupId,
      body: 'reply with provenance',
      metadata: { replyTo },
    })

    const stored = await pool.query(
      `SELECT metadata FROM messaging.group_messages WHERE id = $1`,
      [message.id]
    )
    expect(stored.rows[0].metadata).toEqual({ replyTo })
  })

  it('getRecentMessages returns the newest N in chronological order with type + senderName', async () => {
    const player = await createPlayer(pool)
    const groupId = await createGroup(pool, player.id)

    // 25 player messages; the context window should hold only the newest 20
    for (let i = 1; i <= 25; i++) {
      await repo.sendGroupMessage({ groupId, playerId: player.id, body: `msg ${i}` })
    }
    const { conversationId } = await repo.sendAssistantMessage({
      groupId,
      body: 'coach chimes in',
    })

    // now() is frozen inside the suite transaction, so all rows tie on created_at;
    // spread them to match production (one transaction per insert → distinct now()).
    await pool.query(
      `UPDATE messaging.group_messages
       SET created_at = created_at + (
         CASE WHEN body = 'coach chimes in' THEN 100
              ELSE split_part(body, ' ', 2)::int END * interval '1 second')
       WHERE conversation_id = $1`,
      [conversationId]
    )

    const recent = await repo.getRecentMessages({ conversationId, limit: 20 })

    expect(recent).toHaveLength(20)
    // chronological: oldest of the window first, newest last
    expect(recent[recent.length - 1].body).toBe('coach chimes in')
    expect(recent[recent.length - 1].type).toBe('assistant')
    expect(recent[recent.length - 1].senderName).toBe('Coach')
    expect(recent[recent.length - 2].body).toBe('msg 25')
    expect(recent[0].body).toBe('msg 7') // 26 rows total → window starts at #7
    expect(recent[0].senderName).toBe(player.name)
  })
})
