/**
 * P2.6 — DSR: hold-aware hard-delete of the personal thread
 *
 * Tests:
 *   1. deletePersonalThreadFor: hard-deletes personal conversation + messages
 *   2. deletePersonalThreadFor: idempotent (no-op + no error on second call)
 *   3. deletePersonalThreadFor: skips when player is under legal hold (hold-check seam)
 *   4. deletePersonalThreadFor: leaves co-participant group messages untouched
 *   5. DSR erase composes deletePersonalThreadFor (personal thread gone after erase)
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerFactory } from '../factories'
import { GroupMessageRepository } from '../../repositories/group-message-repository'
import { DataSubjectRequestService } from '../../dsr-service'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Insert a personal conversation + system message for a player. Returns { convId, msgId }. */
async function seedPersonalNotification(
  pool: Pool,
  playerId: string,
): Promise<{ convId: string; msgId: string }> {
  const convRes = await pool.query(
    `INSERT INTO messaging.conversations (type, player_id)
     VALUES ('personal', $1)
     ON CONFLICT (player_id) WHERE player_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [playerId],
  )
  let convId: string
  if (convRes.rows.length > 0) {
    convId = convRes.rows[0].id as string
  } else {
    const sel = await pool.query(
      `SELECT id FROM messaging.conversations WHERE player_id = $1`,
      [playerId],
    )
    convId = sel.rows[0].id as string
  }

  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages
       (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, NULL, 'system', $2, 'system')
     RETURNING id`,
    [convId, `notif-${uid()}`],
  )
  const msgId = msgRes.rows[0].id as string

  await pool.query(
    `INSERT INTO messaging.group_message_recipients (message_id, player_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [msgId, playerId],
  )

  return { convId, msgId }
}

/** Insert a group + group message for a player (to verify co-participant data untouched). */
async function seedGroupMessage(pool: Pool, playerId: string, body: string): Promise<string> {
  const grpRes = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`dsr-group-${uid()}`, playerId],
  )
  const groupId = grpRes.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, playerId],
  )
  const convRes = await pool.query(
    `INSERT INTO messaging.conversations (type, group_id)
     VALUES ('group', $1)
     ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [groupId],
  )
  let convId: string
  if (convRes.rows.length > 0) {
    convId = convRes.rows[0].id as string
  } else {
    const sel = await pool.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId],
    )
    convId = sel.rows[0].id as string
  }
  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages
       (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, $2, 'Player', $3, 'text')
     RETURNING id`,
    [convId, playerId, body],
  )
  return msgRes.rows[0].id as string
}

let pool: Pool

beforeAll(async () => {
  pool = getTestPool()
  await beginTransaction(pool)
})

afterAll(async () => {
  await rollbackTransaction(pool)
})

describe('GroupMessageRepository.deletePersonalThreadFor', () => {
  it('hard-deletes the personal conversation and messages (happy path)', async () => {
    const player = await PlayerFactory.create(pool)
    const { convId, msgId } = await seedPersonalNotification(pool, player.id)

    const repo = new GroupMessageRepository(pool as any)
    await repo.deletePersonalThreadFor(player.id)

    const convRows = await pool.query(
      `SELECT id FROM messaging.conversations WHERE id = $1`,
      [convId],
    )
    expect(convRows.rows).toHaveLength(0)

    const msgRows = await pool.query(
      `SELECT id FROM messaging.group_messages WHERE id = $1`,
      [msgId],
    )
    expect(msgRows.rows).toHaveLength(0)

    const recipRows = await pool.query(
      `SELECT * FROM messaging.group_message_recipients WHERE message_id = $1`,
      [msgId],
    )
    expect(recipRows.rows).toHaveLength(0)
  })

  it('is idempotent (no error on second call, no-op when no personal thread)', async () => {
    const player = await PlayerFactory.create(pool)
    await seedPersonalNotification(pool, player.id)

    const repo = new GroupMessageRepository(pool as any)
    await repo.deletePersonalThreadFor(player.id)
    await expect(repo.deletePersonalThreadFor(player.id)).resolves.toBeUndefined()
  })

  it('skips deletion when player is under legal hold (hold-check seam)', async () => {
    const player = await PlayerFactory.create(pool)
    const { convId } = await seedPersonalNotification(pool, player.id)

    const repo = new GroupMessageRepository(pool as any)
    jest.spyOn(repo, 'isUnderLegalHold').mockResolvedValue(true)

    await repo.deletePersonalThreadFor(player.id)

    // Conversation should still exist — hold prevented deletion
    const convRows = await pool.query(
      `SELECT id FROM messaging.conversations WHERE id = $1`,
      [convId],
    )
    expect(convRows.rows).toHaveLength(1)
  })

  it('leaves group messages (co-participant data) untouched', async () => {
    const player = await PlayerFactory.create(pool)
    await seedPersonalNotification(pool, player.id)
    const groupMsgId = await seedGroupMessage(pool, player.id, 'group-chat message')

    const repo = new GroupMessageRepository(pool as any)
    await repo.deletePersonalThreadFor(player.id)

    const groupMsg = await pool.query(
      `SELECT id FROM messaging.group_messages WHERE id = $1`,
      [groupMsgId],
    )
    expect(groupMsg.rows).toHaveLength(1)
  })
})

describe('DataSubjectRequestService.erase composes personal thread deletion', () => {
  it('personal thread is gone after erase()', async () => {
    const player = await PlayerFactory.create(pool)
    const { convId } = await seedPersonalNotification(pool, player.id)

    const svc = new DataSubjectRequestService(pool)
    const result = await svc.erase(player.email)
    expect(result.status).toBe('erased')

    const convRows = await pool.query(
      `SELECT id FROM messaging.conversations WHERE id = $1`,
      [convId],
    )
    expect(convRows.rows).toHaveLength(0)
  })
})
