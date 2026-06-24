import { Pool } from 'pg'
import { getTestPool, closeTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TournamentFactory, OrganizerFactory } from '../factories'
import { TournamentRepository } from '../../db'

/**
 * Phase 1 integration tests for messaging schema + partitions (migration 032).
 *
 * These tests verify:
 *  1. Both partitioned tables exist in the messaging schema.
 *  2. Each table is RANGE-partitioned on the right column.
 *  3. Aligned monthly partitions exist and route rows correctly.
 *  4. The composite PK (id, created_at) on messages is enforced.
 *  5. The composite FK (message_id, message_created_at) on message_recipients works.
 *  6. public.tournaments.completed_at is a TIMESTAMPTZ column.
 *  7. completed_at is populated when a tournament is transitioned to tournament_complete.
 *
 * No routes or repositories exist yet (Phase 2+); tests go direct to the DB.
 * The test harness rolls back everything — no rows committed.
 */
describe('Messaging schema (migration 032)', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  // ── 1. Schema & table existence ──────────────────────────────────────────

  describe('messaging.messages', () => {
    it('exists as a RANGE-partitioned table', async () => {
      const res = await pool.query(`
        SELECT pt.relname, p.partstrat
        FROM pg_class pt
        JOIN pg_partitioned_table p ON p.partrelid = pt.oid
        JOIN pg_namespace n ON n.oid = pt.relnamespace
        WHERE n.nspname = 'messaging' AND pt.relname = 'messages'
      `)
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].partstrat).toBe('r') // 'r' = RANGE
    })

    it('is partitioned on created_at', async () => {
      const res = await pool.query(`
        SELECT a.attname
        FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(pt.partattrs)
        WHERE n.nspname = 'messaging' AND c.relname = 'messages'
        ORDER BY a.attnum
      `)
      const cols = res.rows.map((r: any) => r.attname)
      expect(cols).toContain('created_at')
    })

    it('has no naive timestamp (timestamp without time zone) columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'messages'
          AND data_type = 'timestamp without time zone'
      `)
      expect(res.rows).toHaveLength(0)
    })
  })

  describe('messaging.message_recipients', () => {
    it('exists as a RANGE-partitioned table', async () => {
      const res = await pool.query(`
        SELECT pt.relname, p.partstrat
        FROM pg_class pt
        JOIN pg_partitioned_table p ON p.partrelid = pt.oid
        JOIN pg_namespace n ON n.oid = pt.relnamespace
        WHERE n.nspname = 'messaging' AND pt.relname = 'message_recipients'
      `)
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].partstrat).toBe('r')
    })

    it('is partitioned on message_created_at', async () => {
      const res = await pool.query(`
        SELECT a.attname
        FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(pt.partattrs)
        WHERE n.nspname = 'messaging' AND c.relname = 'message_recipients'
        ORDER BY a.attnum
      `)
      const cols = res.rows.map((r: any) => r.attname)
      expect(cols).toContain('message_created_at')
    })

    it('has no naive timestamp columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND data_type = 'timestamp without time zone'
      `)
      expect(res.rows).toHaveLength(0)
    })
  })

  // ── 2. Monthly partitions exist and are aligned ──────────────────────────

  it('has at least 3 aligned monthly partitions (2026-06, 2026-07, 2026-08)', async () => {
    const res = await pool.query(`
      SELECT child.relname AS partition_name, n.nspname AS schema_name
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_class child ON child.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = parent.relnamespace
      WHERE n.nspname = 'messaging'
        AND parent.relname IN ('messages', 'message_recipients')
      ORDER BY child.relname
    `)
    const names = res.rows.map((r: any) => r.partition_name)

    // messages partitions
    expect(names).toContain('messages_2026_06')
    expect(names).toContain('messages_2026_07')
    expect(names).toContain('messages_2026_08')

    // message_recipients partitions (aligned)
    expect(names).toContain('message_recipients_2026_06')
    expect(names).toContain('message_recipients_2026_07')
    expect(names).toContain('message_recipients_2026_08')
  })

  // ── 3. Row routing — inserts land in the correct partition ───────────────

  it('routes a row with created_at in 2026-06 to messages_2026_06', async () => {
    const ts = '2026-06-15 10:00:00+00'

    // Resolve a tournament and player for FK satisfaction.
    const { sub: organizerId } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    const tournament = await TournamentFactory.create(pool, organizerId)

    // Ensure a conversation row exists for FK / NOT NULL on conversation_id
    await pool.query(`
      INSERT INTO messaging.conversations (type, tournament_id)
      VALUES ('tournament', $1)
      ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
    `, [tournament.id])

    // Insert a broadcast message directly (recipient_player_id NULL = broadcast)
    const insertRes = await pool.query(`
      INSERT INTO messaging.messages
        (tournament_id, conversation_id, sender_player_id, body, created_at)
      SELECT $1, c.id, $2, 'hello', $3::timestamptz
      FROM messaging.conversations c WHERE c.tournament_id = $1
      RETURNING id, created_at
    `, [tournament.id, tournament.creator_id, ts])

    const { id, created_at } = insertRes.rows[0]

    // Ask Postgres which partition this row lives in
    const partRes = await pool.query(`
      SELECT tableoid::regclass::text AS partition
      FROM messaging.messages
      WHERE id = $1 AND created_at = $2::timestamptz
    `, [id, created_at])

    expect(partRes.rows[0].partition).toBe('messaging.messages_2026_06')
  })

  it('routes a message_recipients row with message_created_at in 2026-07 to message_recipients_2026_07', async () => {
    const ts = '2026-07-10 12:00:00+00'

    const { sub: organizerId } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    const tournament = await TournamentFactory.create(pool, organizerId)

    // Ensure a conversation row exists
    await pool.query(`
      INSERT INTO messaging.conversations (type, tournament_id)
      VALUES ('tournament', $1)
      ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
    `, [tournament.id])

    // Insert parent message
    const msgRes = await pool.query(`
      INSERT INTO messaging.messages
        (tournament_id, conversation_id, sender_player_id, body, created_at)
      SELECT $1, c.id, $2, 'broadcast', $3::timestamptz
      FROM messaging.conversations c WHERE c.tournament_id = $1
      RETURNING id
    `, [tournament.id, tournament.creator_id, ts])
    const messageId = msgRes.rows[0].id

    // Insert recipient row
    const recipRes = await pool.query(`
      INSERT INTO messaging.message_recipients
        (message_id, message_created_at, player_id)
      VALUES ($1, $2::timestamptz, $3)
      RETURNING player_id
    `, [messageId, ts, tournament.creator_id])

    expect(recipRes.rows).toHaveLength(1)

    // Confirm partition routing
    const partRes = await pool.query(`
      SELECT tableoid::regclass::text AS partition
      FROM messaging.message_recipients
      WHERE message_id = $1 AND message_created_at = $2::timestamptz
    `, [messageId, ts])

    expect(partRes.rows[0].partition).toBe('messaging.message_recipients_2026_07')
  })

  // ── 4. PK (id, created_at) is enforced on messages ──────────────────────

  it('enforces the (id, created_at) PK on messages', async () => {
    const ts = '2026-06-20 08:00:00+00'

    const { sub: organizerId } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    const tournament = await TournamentFactory.create(pool, organizerId)

    // Ensure conversation row exists
    await pool.query(`
      INSERT INTO messaging.conversations (type, tournament_id)
      VALUES ('tournament', $1)
      ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
    `, [tournament.id])

    const msgRes = await pool.query(`
      INSERT INTO messaging.messages
        (tournament_id, conversation_id, sender_player_id, body, created_at)
      SELECT $1, c.id, $2, 'dup test', $3::timestamptz
      FROM messaging.conversations c WHERE c.tournament_id = $1
      RETURNING id
    `, [tournament.id, tournament.creator_id, ts])
    const messageId = msgRes.rows[0].id

    await expect(
      pool.query(`
        INSERT INTO messaging.messages
          (id, tournament_id, conversation_id, sender_player_id, body, created_at)
        SELECT $1, $2, c.id, $3, 'dup', $4::timestamptz
        FROM messaging.conversations c WHERE c.tournament_id = $2
      `, [messageId, tournament.id, tournament.creator_id, ts])
    ).rejects.toThrow()
  })

  // ── 5. Composite FK (message_id, message_created_at) is enforced ─────────

  it('rejects a message_recipients row with a non-existent (message_id, message_created_at)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001'
    const ts = '2026-06-01 00:00:00+00'

    const { sub: organizerId } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    const tournament = await TournamentFactory.create(pool, organizerId)

    await expect(
      pool.query(`
        INSERT INTO messaging.message_recipients
          (message_id, message_created_at, player_id)
        VALUES ($1, $2::timestamptz, $3)
      `, [fakeId, ts, tournament.creator_id])
    ).rejects.toThrow()
  })

  // ── 6 & 7. tournaments.completed_at column and transition ─────────────────

  describe('public.tournaments.completed_at', () => {
    it('exists as a timestamptz column on the tournaments table', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tournaments'
          AND column_name = 'completed_at'
      `)
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].data_type).toBe('timestamp with time zone')
      expect(res.rows[0].is_nullable).toBe('YES')
    })

    it('is NULL for a newly created tournament', async () => {
      const { sub: organizerId } = OrganizerFactory.token({
        secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
        expiresInSeconds: 3600,
      })
      const tournament = await TournamentFactory.create(pool, organizerId)

      const res = await pool.query(
        'SELECT completed_at FROM public.tournaments WHERE id = $1',
        [tournament.id]
      )
      expect(res.rows[0].completed_at).toBeNull()
    })

    it('is set to now() when the tournament transitions to tournament_complete', async () => {
      const { sub: organizerId } = OrganizerFactory.token({
        secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
        expiresInSeconds: 3600,
      })
      const tournament = await TournamentFactory.create(pool, organizerId)

      const beforeTransition = new Date()

      const repo = new TournamentRepository(pool)
      await repo.updateStatus(tournament.id, 'tournament_complete')

      const res = await pool.query(
        'SELECT completed_at FROM public.tournaments WHERE id = $1',
        [tournament.id]
      )
      const completedAt = res.rows[0].completed_at

      expect(completedAt).not.toBeNull()
      expect(new Date(completedAt).getTime()).toBeGreaterThanOrEqual(beforeTransition.getTime())
    })
  })
})
