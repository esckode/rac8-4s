/**
 * P3.3 — Auto-close consumer (RED tests)
 *
 * Tests:
 *   1. sweep closes a poll with auto_close_at in the past
 *   2. sweep does NOT close a poll with auto_close_at in the future
 *   3. sweep skips already-closed polls (idempotent)
 *   4. closed poll gets a system tally message in the group history
 *   5. running the sweep twice closes nothing the second time
 *   6. manual close still works (poll without auto_close_at)
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { processAutoCloseSweep } from '../../workers/auto-close-processor'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `ac-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email, name, undefined, undefined, defaultAdultAttestation(),
  )
  return { id: player.id, email: player.email, name: player.name ?? name }
}

/** Create a group + owner membership. Returns groupId. */
async function createGroup(pool: Pool, ownerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`ac-grp-${uid()}`, ownerId],
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, ownerId],
  )
  return groupId
}

/** Create a poll in a group conversation. Returns { pollId, messageId, conversationId }. */
async function createPollInGroup(
  pool: Pool,
  groupId: string,
  creatorId: string,
  autoCloseAt: Date | null,
): Promise<{ pollId: string; messageId: string; conversationId: string }> {
  // Resolve/create conversation
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
    const sel = await pool.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId],
    )
    conversationId = sel.rows[0].id as string
  }

  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages
       (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, $2, 'Player', 'Are you in?', 'poll')
     RETURNING id`,
    [conversationId, creatorId],
  )
  const messageId = msgRes.rows[0].id as string

  const pollRes = await pool.query(
    `INSERT INTO messaging.polls
       (message_id, question, creator_player_id, auto_close_at)
     VALUES ($1, 'Are you in?', $2, $3)
     RETURNING id`,
    [messageId, creatorId, autoCloseAt],
  )
  const pollId = pollRes.rows[0].id as string

  return { pollId, messageId, conversationId }
}

let pool: Pool

beforeAll(async () => {
  pool = await getTestPool()
  await beginTransaction(pool)
})

afterAll(async () => {
  await rollbackTransaction()
})

describe('processAutoCloseSweep', () => {
  it('closes a poll with auto_close_at in the past', async () => {
    const owner = await createPlayer(pool)
    const groupId = await createGroup(pool, owner.id)
    const pastTime = new Date(Date.now() - 60_000)
    const { pollId } = await createPollInGroup(pool, groupId, owner.id, pastTime)

    await processAutoCloseSweep({ pool })

    const row = await pool.query(
      `SELECT closed_at FROM messaging.polls WHERE id = $1`,
      [pollId],
    )
    expect(row.rows[0].closed_at).not.toBeNull()
  })

  it('does NOT close a poll with auto_close_at in the future', async () => {
    const owner = await createPlayer(pool)
    const groupId = await createGroup(pool, owner.id)
    const futureTime = new Date(Date.now() + 3_600_000)
    const { pollId } = await createPollInGroup(pool, groupId, owner.id, futureTime)

    await processAutoCloseSweep({ pool })

    const row = await pool.query(
      `SELECT closed_at FROM messaging.polls WHERE id = $1`,
      [pollId],
    )
    expect(row.rows[0].closed_at).toBeNull()
  })

  it('skips already-closed polls (idempotent per-poll)', async () => {
    const owner = await createPlayer(pool)
    const groupId = await createGroup(pool, owner.id)
    const pastTime = new Date(Date.now() - 60_000)
    const { messageId } = await createPollInGroup(pool, groupId, owner.id, pastTime)

    // Pre-close the poll manually
    await pool.query(
      `UPDATE messaging.polls SET closed_at = now() WHERE message_id = $1`,
      [messageId],
    )

    // Sweep should not throw even if poll is already closed
    await expect(processAutoCloseSweep({ pool })).resolves.toBeUndefined()
  })

  it('closed poll gets a system tally message in the group history', async () => {
    const owner = await createPlayer(pool)
    const groupId = await createGroup(pool, owner.id)
    const pastTime = new Date(Date.now() - 60_000)
    const { conversationId } = await createPollInGroup(pool, groupId, owner.id, pastTime)

    await processAutoCloseSweep({ pool })

    const systemMsgs = await pool.query(
      `SELECT body FROM messaging.group_messages
       WHERE conversation_id = $1 AND type = 'system'
       ORDER BY created_at`,
      [conversationId],
    )
    expect(systemMsgs.rows.length).toBeGreaterThan(0)
    const systemBody: string = systemMsgs.rows[systemMsgs.rows.length - 1].body
    expect(systemBody).toContain('Poll closed')
  })

  it('running the sweep twice closes nothing the second time', async () => {
    const owner = await createPlayer(pool)
    const groupId = await createGroup(pool, owner.id)
    const pastTime = new Date(Date.now() - 60_000)
    const { conversationId } = await createPollInGroup(pool, groupId, owner.id, pastTime)

    await processAutoCloseSweep({ pool })
    const after1 = await pool.query(
      `SELECT body FROM messaging.group_messages WHERE conversation_id = $1 AND type = 'system'`,
      [conversationId],
    )

    await processAutoCloseSweep({ pool })
    const after2 = await pool.query(
      `SELECT body FROM messaging.group_messages WHERE conversation_id = $1 AND type = 'system'`,
      [conversationId],
    )

    // Same number of system messages — no double-close
    expect(after2.rows.length).toBe(after1.rows.length)
  })

  it('does not affect polls without auto_close_at', async () => {
    const owner = await createPlayer(pool)
    const groupId = await createGroup(pool, owner.id)
    const { pollId } = await createPollInGroup(pool, groupId, owner.id, null)

    await processAutoCloseSweep({ pool })

    const row = await pool.query(
      `SELECT closed_at FROM messaging.polls WHERE id = $1`,
      [pollId],
    )
    expect(row.rows[0].closed_at).toBeNull()
  })
})
