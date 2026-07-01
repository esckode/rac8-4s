/**
 * P2.1 — Schema: personal conversation (migration 046)
 *
 * RED: these tests verify the schema additions and resolver introduced in P2.1.
 * They will FAIL until migration 046 is applied and resolvePersonalConversation is implemented.
 */
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction, closeTestPool } from '../helpers/db'
import { PlayerFactory } from '../factories'
import { ConversationRepository } from '../../repositories/conversation-repository'

describe('P2.1 — personal conversation schema + resolver', () => {
  let pool: Pool
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await closeTestPool()
  })

  beforeEach(async () => {
    await beginTransaction(pool)
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  // ── Migration 046 schema ───────────────────────────────────────────────────

  describe('migration 046 schema', () => {
    it("conversations.type CHECK allows 'personal'", async () => {
      await expect(
        pool.query(
          `INSERT INTO messaging.conversations (type, player_id) VALUES ('personal', gen_random_uuid()::text)`
        )
      ).resolves.toBeDefined()
    })

    it('conversations table has player_id column', async () => {
      const res = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'messaging' AND table_name = 'conversations'
          AND column_name = 'player_id'
      `)
      expect(res.rows.length).toBe(1)
    })

    it('partial unique index: one personal conversation per player', async () => {
      const playerId = 'player-unique-test'
      await pool.query(
        `INSERT INTO messaging.conversations (type, player_id) VALUES ('personal', $1)`,
        [playerId]
      )
      await expect(
        pool.query(
          `INSERT INTO messaging.conversations (type, player_id) VALUES ('personal', $1)`,
          [playerId]
        )
      ).rejects.toThrow()
    })
  })

  // ── resolvePersonalConversation ────────────────────────────────────────────

  describe('resolvePersonalConversation', () => {
    it('returns a UUID', async () => {
      const player = await PlayerFactory.create(pool)
      const convId = await convRepo.resolvePersonalConversation(player.id)
      expect(convId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('is idempotent — same player always returns same conversation_id', async () => {
      const player = await PlayerFactory.create(pool)
      const id1 = await convRepo.resolvePersonalConversation(player.id)
      const id2 = await convRepo.resolvePersonalConversation(player.id)
      expect(id1).toBe(id2)
    })

    it('different players get different conversation_ids', async () => {
      const p1 = await PlayerFactory.create(pool)
      const p2 = await PlayerFactory.create(pool)
      const id1 = await convRepo.resolvePersonalConversation(p1.id)
      const id2 = await convRepo.resolvePersonalConversation(p2.id)
      expect(id1).not.toBe(id2)
    })

    it('created conversation has type=personal and player_id set', async () => {
      const player = await PlayerFactory.create(pool)
      const convId = await convRepo.resolvePersonalConversation(player.id)
      const res = await pool.query(
        'SELECT type, player_id FROM messaging.conversations WHERE id = $1',
        [convId]
      )
      expect(res.rows[0].type).toBe('personal')
      expect(res.rows[0].player_id).toBe(player.id)
    })
  })
})
