/**
 * G2.1 — Group conversation + durable group_messages (anonymization-ready)
 *
 * RED tests (TDD): written FIRST; will fail until:
 *   1. Migration 040 is applied (messages.type, group_messages table,
 *      group_id index on conversations, retention update).
 *   2. ConversationRepository.resolveGroupConversation is implemented.
 *   3. ConversationRepository.anonymizeGroupMessagesFor is implemented.
 *
 * All DB work runs via getTestPool() so nothing is committed.
 *
 * Three suites:
 *   A. Migration assertions — schema shape, §0.5 rules
 *   B. Retention exemption — purge_old_partitions leaves group conversation rows intact
 *   C. §0.5 contract test — anonymizeGroupMessagesFor is the legal-critical deliverable
 */

import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction, closeTestPool } from '../helpers/db'
import { PlayerFactory } from '../factories'
import { OrganizerFactory } from '../factories'
import { ConversationRepository } from '../../repositories/conversation-repository'

// ── Suite-level helpers ──────────────────────────────────────────────────────

function uid(): string {
  const { randomUUID } = require('crypto')
  return randomUUID().slice(0, 8)
}

/** Insert a player_group row and return its UUID id. */
async function createPlayerGroup(pool: Pool, createdBy: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by)
     VALUES ($1, $2)
     RETURNING id`,
    [`Test Group ${uid()}`, createdBy]
  )
  return res.rows[0].id as string
}

/** Insert a group_messages row and return its id. */
async function insertGroupMessage(
  pool: Pool,
  opts: {
    conversationId: string
    playerId: string | null
    senderNameSnapshot: string
    body: string
    messageType?: string
  }
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO messaging.group_messages
       (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      opts.conversationId,
      opts.playerId,
      opts.senderNameSnapshot,
      opts.body,
      opts.messageType ?? 'text',
    ]
  )
  return res.rows[0].id as string
}

// ── Suite A: Migration schema assertions ─────────────────────────────────────

describe('G2.1 migration 040 — schema assertions', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  // ── messages.type column ────────────────────────────────────────────────

  describe('messages.type column', () => {
    it('messaging.messages has a type column', async () => {
      const res = await pool.query(`
        SELECT column_name, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'messages'
          AND column_name = 'type'
      `)
      expect(res.rows.length).toBe(1)
    })

    it('messages.type defaults to "text"', async () => {
      const res = await pool.query(`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'messages'
          AND column_name = 'type'
      `)
      expect(res.rows[0].column_default).toContain('text')
    })

    it('messages.type CHECK allows text, poll, system, announcement', async () => {
      // We verify the constraint by checking the check constraint exists in pg_constraint
      const res = await pool.query(`
        SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'messaging'
          AND r.relname = 'messages'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%type%'
      `)
      // At least one check constraint must mention the type values
      const defs: string[] = res.rows.map((r: any) => r.def)
      const combined = defs.join(' ')
      expect(combined).toMatch(/text/)
      expect(combined).toMatch(/poll/)
      expect(combined).toMatch(/system/)
      expect(combined).toMatch(/announcement/)
    })
  })

  // ── messaging.group_messages table ─────────────────────────────────────

  describe('messaging.group_messages table (§0.5 assertions)', () => {
    it('messaging.group_messages table exists', async () => {
      const res = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'messaging'
          AND table_name = 'group_messages'
      `)
      expect(res.rows.length).toBe(1)
    })

    it('group_messages has id, conversation_id, player_id, sender_name_snapshot, body, type, created_at columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'group_messages'
        ORDER BY ordinal_position
      `)
      const cols = res.rows.map((r: any) => r.column_name)
      expect(cols).toContain('id')
      expect(cols).toContain('conversation_id')
      expect(cols).toContain('player_id')
      expect(cols).toContain('sender_name_snapshot')
      expect(cols).toContain('body')
      expect(cols).toContain('type')
      expect(cols).toContain('created_at')
    })

    it('§0.5: group_messages.player_id is NULLABLE (required for tombstoning)', async () => {
      const res = await pool.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'group_messages'
          AND column_name = 'player_id'
      `)
      expect(res.rows.length).toBe(1)
      expect(res.rows[0].is_nullable).toBe('YES')
    })

    it('§0.5: sender_name_snapshot column exists (tombstone-able display name)', async () => {
      const res = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'group_messages'
          AND column_name = 'sender_name_snapshot'
      `)
      expect(res.rows.length).toBe(1)
    })

    it('group_messages.created_at is TIMESTAMPTZ (UTC-everywhere)', async () => {
      const res = await pool.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'group_messages'
          AND column_name = 'created_at'
      `)
      expect(res.rows.length).toBe(1)
      // Postgres info_schema returns 'timestamp with time zone' for TIMESTAMPTZ
      expect(res.rows[0].data_type).toBe('timestamp with time zone')
    })

    it('group_messages has an index on (conversation_id, created_at)', async () => {
      const res = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'messaging'
          AND tablename = 'group_messages'
      `)
      const names: string[] = res.rows.map((r: any) => r.indexname)
      // There must be at least one index that includes both columns
      const res2 = await pool.query(`
        SELECT ix.indexname
        FROM pg_indexes ix
        JOIN pg_class c ON c.relname = ix.indexname
        JOIN pg_index i ON i.indexrelid = c.oid
        JOIN pg_attribute a1 ON a1.attrelid = i.indrelid AND a1.attnum = ANY(i.indkey)
        JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = ANY(i.indkey)
        WHERE ix.schemaname = 'messaging'
          AND ix.tablename = 'group_messages'
          AND a1.attname = 'conversation_id'
          AND a2.attname = 'created_at'
      `)
      expect(res2.rows.length).toBeGreaterThan(0)
    })

    it('group_messages is NOT partitioned (durable, low-volume)', async () => {
      const res = await pool.query(`
        SELECT relkind
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'messaging'
          AND c.relname = 'group_messages'
      `)
      expect(res.rows.length).toBe(1)
      // 'r' = regular table; 'p' = partitioned table
      expect(res.rows[0].relkind).toBe('r')
    })
  })

  // ── conversations.group_id → player_groups ──────────────────────────────

  describe('conversations.group_id links to player_groups', () => {
    it('conversations table has group_id column', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'conversations'
          AND column_name = 'group_id'
      `)
      expect(res.rows.length).toBe(1)
    })

    it('a group conversation row can be inserted with type=group and group_id referencing a player_group UUID', async () => {
      // We need a player to be created_by, then a group
      const org = OrganizerFactory.token({
        secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
        expiresInSeconds: 3600,
      })
      // Create a player to own the group
      const player = await PlayerFactory.create(pool)
      const groupId = await createPlayerGroup(pool, player.id)

      // Insert a conversation row with type='group' and group_id = groupId (as text)
      const res = await pool.query(
        `INSERT INTO messaging.conversations (type, group_id)
         VALUES ('group', $1)
         RETURNING id, type, group_id`,
        [groupId]
      )
      expect(res.rows[0].type).toBe('group')
      expect(res.rows[0].group_id).toBe(groupId)
    })
  })
})

// ── Suite B: Retention exemption ─────────────────────────────────────────────

describe('G2.1 retention exemption — group conversations survive purge_old_partitions', () => {
  let pool: Pool
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  it('purge_old_partitions does NOT remove group_messages rows (group convos are durable)', async () => {
    // Create a group + conversation + group_messages row
    const player = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, player.id)
    const convId = await convRepo.resolveGroupConversation(groupId)

    // Insert a group message
    await insertGroupMessage(pool, {
      conversationId: convId,
      playerId: player.id,
      senderNameSnapshot: player.name ?? 'Player',
      body: 'a durable group message',
    })

    // Run purge_old_partitions — it operates on partitioned messaging.messages,
    // not on group_messages (which is a plain table). This verifies the durable
    // table is untouched.
    await pool.query(`SELECT * FROM messaging.purge_old_partitions(90, 45)`)

    // group_messages row must still be there
    const res = await pool.query(
      `SELECT COUNT(*) AS n FROM messaging.group_messages WHERE conversation_id = $1`,
      [convId]
    )
    expect(Number(res.rows[0].n)).toBe(1)
  })

  it('group conversation row in messaging.conversations survives a purge run', async () => {
    const player = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, player.id)
    const convId = await convRepo.resolveGroupConversation(groupId)

    await pool.query(`SELECT * FROM messaging.purge_old_partitions(90, 45)`)

    const res = await pool.query(
      `SELECT id, type FROM messaging.conversations WHERE id = $1`,
      [convId]
    )
    expect(res.rows.length).toBe(1)
    expect(res.rows[0].type).toBe('group')
  })
})

// ── Suite C: §0.5 Contract test — anonymizeGroupMessagesFor (LEGAL-CRITICAL) ─

describe('G2.1 §0.5 contract — anonymizeGroupMessagesFor', () => {
  let pool: Pool
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  it('tombstones player A messages (body cleared, player_id NULL, name→"Former player") while player B messages are untouched', async () => {
    // Seed: two players, one group conversation, messages from both
    const playerA = await PlayerFactory.create(pool)
    const playerB = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, playerA.id)
    const convId = await convRepo.resolveGroupConversation(groupId)

    const msgAId = await insertGroupMessage(pool, {
      conversationId: convId,
      playerId: playerA.id,
      senderNameSnapshot: 'Alice',
      body: 'Hello from Alice',
    })
    const msgBId = await insertGroupMessage(pool, {
      conversationId: convId,
      playerId: playerB.id,
      senderNameSnapshot: 'Bob',
      body: 'Hello from Bob',
    })

    // Execute the erasure primitive for player A
    await convRepo.anonymizeGroupMessagesFor(playerA.id)

    // Assert player A's message is tombstoned
    const aRow = await pool.query(
      `SELECT player_id, sender_name_snapshot, body FROM messaging.group_messages WHERE id = $1`,
      [msgAId]
    )
    expect(aRow.rows[0].player_id).toBeNull()
    expect(aRow.rows[0].sender_name_snapshot).toBe('Former player')
    expect(aRow.rows[0].body).toBe('')

    // Assert player B's message is COMPLETELY UNTOUCHED
    const bRow = await pool.query(
      `SELECT player_id, sender_name_snapshot, body FROM messaging.group_messages WHERE id = $1`,
      [msgBId]
    )
    expect(bRow.rows[0].player_id).toBe(playerB.id)
    expect(bRow.rows[0].sender_name_snapshot).toBe('Bob')
    expect(bRow.rows[0].body).toBe('Hello from Bob')
  })

  it('anonymizeGroupMessagesFor is idempotent — re-running produces the same tombstone result', async () => {
    const playerA = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, playerA.id)
    const convId = await convRepo.resolveGroupConversation(groupId)

    const msgId = await insertGroupMessage(pool, {
      conversationId: convId,
      playerId: playerA.id,
      senderNameSnapshot: 'Alice',
      body: 'Should be erased',
    })

    // Run once
    await convRepo.anonymizeGroupMessagesFor(playerA.id)
    // Run again — must not throw and must not corrupt
    await convRepo.anonymizeGroupMessagesFor(playerA.id)

    const row = await pool.query(
      `SELECT player_id, sender_name_snapshot, body FROM messaging.group_messages WHERE id = $1`,
      [msgId]
    )
    expect(row.rows[0].player_id).toBeNull()
    expect(row.rows[0].sender_name_snapshot).toBe('Former player')
    expect(row.rows[0].body).toBe('')
  })

  it('anonymizeGroupMessagesFor with no messages for the player is a no-op (does not throw)', async () => {
    const playerA = await PlayerFactory.create(pool)
    const playerB = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, playerB.id)
    const convId = await convRepo.resolveGroupConversation(groupId)

    // Only player B has messages
    const msgBId = await insertGroupMessage(pool, {
      conversationId: convId,
      playerId: playerB.id,
      senderNameSnapshot: 'Bob',
      body: 'Bob only message',
    })

    // Erase for player A (who has no messages) — must not throw
    await expect(convRepo.anonymizeGroupMessagesFor(playerA.id)).resolves.toBeUndefined()

    // Player B's message untouched
    const bRow = await pool.query(
      `SELECT player_id, sender_name_snapshot, body FROM messaging.group_messages WHERE id = $1`,
      [msgBId]
    )
    expect(bRow.rows[0].player_id).toBe(playerB.id)
    expect(bRow.rows[0].sender_name_snapshot).toBe('Bob')
    expect(bRow.rows[0].body).toBe('Bob only message')
  })

  it('anonymizeGroupMessagesFor spans multiple conversations for the same player', async () => {
    const playerA = await PlayerFactory.create(pool)
    const groupId1 = await createPlayerGroup(pool, playerA.id)
    const groupId2 = await createPlayerGroup(pool, playerA.id)
    const convId1 = await convRepo.resolveGroupConversation(groupId1)
    const convId2 = await convRepo.resolveGroupConversation(groupId2)

    const msgId1 = await insertGroupMessage(pool, {
      conversationId: convId1,
      playerId: playerA.id,
      senderNameSnapshot: 'Alice',
      body: 'Message in group 1',
    })
    const msgId2 = await insertGroupMessage(pool, {
      conversationId: convId2,
      playerId: playerA.id,
      senderNameSnapshot: 'Alice',
      body: 'Message in group 2',
    })

    await convRepo.anonymizeGroupMessagesFor(playerA.id)

    for (const msgId of [msgId1, msgId2]) {
      const row = await pool.query(
        `SELECT player_id, sender_name_snapshot, body FROM messaging.group_messages WHERE id = $1`,
        [msgId]
      )
      expect(row.rows[0].player_id).toBeNull()
      expect(row.rows[0].sender_name_snapshot).toBe('Former player')
      expect(row.rows[0].body).toBe('')
    }
  })
})

// ── Suite D: ConversationRepository.resolveGroupConversation ─────────────────

describe('G2.1 ConversationRepository.resolveGroupConversation', () => {
  let pool: Pool
  let convRepo: ConversationRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    convRepo = new ConversationRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  it('resolveGroupConversation returns a UUID for a player_group', async () => {
    const player = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, player.id)
    const convId = await convRepo.resolveGroupConversation(groupId)
    expect(convId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('resolveGroupConversation is idempotent — same group always returns same conversation_id', async () => {
    const player = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, player.id)
    const id1 = await convRepo.resolveGroupConversation(groupId)
    const id2 = await convRepo.resolveGroupConversation(groupId)
    expect(id1).toBe(id2)
  })

  it('different groups get different conversation_ids', async () => {
    const player = await PlayerFactory.create(pool)
    const groupId1 = await createPlayerGroup(pool, player.id)
    const groupId2 = await createPlayerGroup(pool, player.id)
    const id1 = await convRepo.resolveGroupConversation(groupId1)
    const id2 = await convRepo.resolveGroupConversation(groupId2)
    expect(id1).not.toBe(id2)
  })

  it('created group conversation has type=group and group_id set', async () => {
    const player = await PlayerFactory.create(pool)
    const groupId = await createPlayerGroup(pool, player.id)
    const convId = await convRepo.resolveGroupConversation(groupId)
    const res = await pool.query(
      `SELECT type, group_id FROM messaging.conversations WHERE id = $1`,
      [convId]
    )
    expect(res.rows[0].type).toBe('group')
    expect(res.rows[0].group_id).toBe(groupId)
  })
})
