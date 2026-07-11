/**
 * A9.3 — DSR: scrub an erased player's exact-name mentions inside
 * type='assistant' message bodies (RED first).
 *
 * assistant rows are never authored by the erased player (sender is always
 * 'Coach', player_id NULL) — anonymizeGroupMessagesFor (which matches on
 * player_id) never touches them. This is a separate, best-effort scrub:
 * exact-substring replace of the player's pre-erasure display name with
 * "Former player" inside assistant bodies. Paraphrases are out of scope
 * (documented best-effort) — only exact-name matching is tested.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerFactory } from '../factories'
import { DataSubjectRequestService } from '../../dsr-service'
import { GroupMessageRepository } from '../../repositories/group-message-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createGroup(pool: Pool, ownerPlayerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`dsr-scrub-group-${uid()}`, ownerPlayerId]
  )
  return res.rows[0].id as string
}

describe('A9.3 — DSR scrub of assistant-mentioned names', () => {
  let pool: Pool
  let svc: DataSubjectRequestService
  let groupMsgRepo: GroupMessageRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    svc = new DataSubjectRequestService(pool)
    groupMsgRepo = new GroupMessageRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it("rewrites the erased player's exact name inside an assistant reply body", async () => {
    const target = await PlayerFactory.create(pool, { name: `Zelda Erasetest ${uid()}` })
    const groupId = await createGroup(pool, target.id)

    await groupMsgRepo.sendAssistantMessage({
      groupId,
      body: `Saturday 9am vs ${target.name}, Court 2.`,
    })

    const result = await svc.erase(target.email)
    expect(result.status).toBe('erased')

    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE gm.type = 'assistant' AND c.group_id = $1`,
      [groupId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].body).toBe('Saturday 9am vs Former player, Court 2.')
    expect(rows.rows[0].body).not.toContain(target.name)
  })

  it('leaves assistant bodies that never mentioned the player untouched', async () => {
    const target = await PlayerFactory.create(pool, { name: `Unrelated Name ${uid()}` })
    const bystander = await PlayerFactory.create(pool)
    const groupId = await createGroup(pool, bystander.id)

    await groupMsgRepo.sendAssistantMessage({
      groupId,
      body: 'Standings: 1. Alice 2. Bob',
    })

    await svc.erase(target.email)

    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE gm.type = 'assistant' AND c.group_id = $1`,
      [groupId]
    )
    expect(rows.rows[0].body).toBe('Standings: 1. Alice 2. Bob')
  })

  it('rewrites every occurrence across multiple assistant messages', async () => {
    const target = await PlayerFactory.create(pool, { name: `Multi Mention ${uid()}` })
    const groupId = await createGroup(pool, target.id)

    await groupMsgRepo.sendAssistantMessage({ groupId, body: `${target.name} is ranked 1st.` })
    await groupMsgRepo.sendAssistantMessage({ groupId, body: `Next: vs ${target.name} (Spring Open)` })

    await svc.erase(target.email)

    const rows = await pool.query(
      `SELECT gm.body FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE gm.type = 'assistant' AND c.group_id = $1
       ORDER BY gm.created_at`,
      [groupId]
    )
    expect(rows.rows.map((r: { body: string }) => r.body)).toEqual([
      'Former player is ranked 1st.',
      'Next: vs Former player (Spring Open)',
    ])
  })
})
