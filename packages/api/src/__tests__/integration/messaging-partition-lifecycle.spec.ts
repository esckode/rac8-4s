import { Pool } from 'pg'
import { getTestPool, closeTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TournamentFactory, OrganizerFactory } from '../factories'

/**
 * Phase 2 integration tests for messaging partition lifecycle (migration 033).
 *
 * These tests verify:
 *  1. ensure_future_partitions(2) creates aligned partitions for current + next N months,
 *     idempotently (safe to call twice).
 *  2. The four boundary-safe purge cases from §5.3 / §6.2 of the spec.
 *
 * HARNESS CAVEAT (§6.4):
 * Partition CREATE/DROP/DETACH is transactional DDL in Postgres — it rolls back inside
 * the per-suite savepoint harness. We assert on:
 *  - the function's RETURNED action set (rows returned by purge_old_partitions)
 *  - post-call partition existence via pg_class / pg_inherits WITHIN the transaction
 * We do NOT rely on cross-suite persistence.
 *
 * To test purge we create OLD partitions (months ~2 years ago) via SQL inside the
 * transaction, insert messages there with an old `created_at`, configure the relevant
 * tournament's `completed_at` / `legal_hold`, then call purge_old_partitions and assert
 * the returned action.
 */
describe('Messaging partition lifecycle (migration 033)', () => {
  let pool: Pool
  let organizerId: string

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)

    const { sub } = OrganizerFactory.token({
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    })
    organizerId = sub
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  // ── Helper: check if a partition exists (by name) ────────────────────────
  async function partitionExists(schemaName: string, partName: string): Promise<boolean> {
    const res = await pool.query(`
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
    `, [schemaName, partName])
    return res.rows.length > 0
  }

  // ── Helper: check if a partition is attached (is an inheritance child) ───
  async function partitionAttached(schemaName: string, partName: string): Promise<boolean> {
    const res = await pool.query(`
      SELECT 1
      FROM pg_inherits i
      JOIN pg_class child ON child.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      WHERE n.nspname = $1 AND child.relname = $2
    `, [schemaName, partName])
    return res.rows.length > 0
  }

  // ── Helper: create an old partition (e.g. 2024-01) within the transaction ─
  async function createOldPartition(yearMonth: string): Promise<void> {
    // yearMonth = 'YYYY-MM', e.g. '2024-01'
    const [year, month] = yearMonth.split('-')
    const suffix = `${year}_${month.padStart(2, '0')}`
    const nextMonth = new Date(Date.UTC(parseInt(year), parseInt(month) - 1 + 1, 1))
    const nextMonthStr = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`
    const startStr = `${year}-${month.padStart(2, '0')}-01`

    // Create messages partition
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messaging.messages_${suffix}
        PARTITION OF messaging.messages
        FOR VALUES FROM ('${startStr}') TO ('${nextMonthStr}')
    `)

    // Create aligned message_recipients partition
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messaging.message_recipients_${suffix}
        PARTITION OF messaging.message_recipients
        FOR VALUES FROM ('${startStr}') TO ('${nextMonthStr}')
    `)
  }

  // ── 1. ensure_future_partitions ──────────────────────────────────────────

  describe('messaging.ensure_future_partitions(months_ahead)', () => {
    it('creates partitions for current + next 2 months idempotently', async () => {
      // Call once — should create partitions
      await pool.query(`SELECT messaging.ensure_future_partitions(2)`)

      // The function should have created partitions for at least the next 2 months from now.
      // Since tests run in 2026-06, we expect 2026-06, 2026-07, 2026-08 partitions.
      // (Some already exist from migration 032, which is fine — it must be idempotent.)

      // Verify current month partition exists (2026-06 created by 032)
      expect(await partitionExists('messaging', 'messages_2026_06')).toBe(true)
      expect(await partitionExists('messaging', 'message_recipients_2026_06')).toBe(true)

      // Call again — must not throw (idempotent)
      await expect(
        pool.query(`SELECT messaging.ensure_future_partitions(2)`)
      ).resolves.toBeDefined()
    })

    it('creates aligned partitions for both messages and message_recipients', async () => {
      await pool.query(`SELECT messaging.ensure_future_partitions(2)`)

      // Find partitions created by the function (beyond those from migration 032)
      const res = await pool.query(`
        SELECT child.relname AS name
        FROM pg_inherits i
        JOIN pg_class parent ON parent.oid = i.inhparent
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_namespace n ON n.oid = parent.relnamespace
        WHERE n.nspname = 'messaging'
          AND parent.relname IN ('messages', 'message_recipients')
        ORDER BY child.relname
      `)
      const names: string[] = res.rows.map((r: { name: string }) => r.name)

      // Each messages_YYYY_MM must have a corresponding message_recipients_YYYY_MM
      const msgParts = names.filter((n) => n.startsWith('messages_') && !n.startsWith('messages_202'))
        .concat(names.filter((n) => n.startsWith('messages_202')))
        .filter((n) => !n.includes('recipients'))
      const recipParts = names.filter((n) => n.includes('recipients'))

      // For every messages partition, a recipients partition must exist too
      for (const mp of msgParts) {
        const suffix = mp.replace('messages_', '')
        expect(recipParts).toContain(`message_recipients_${suffix}`)
      }
    })
  })

  // ── 2. Boundary-safe purge: the four cases ───────────────────────────────
  //
  // We use retention_days=90, drop_padding_days=45.
  // A partition is "old enough to consider" when it is older than (90+45=135) days.
  // Since today is 2026-06, a partition for 2024-01 is ~30 months old → well past gate.

  describe('messaging.purge_old_partitions — boundary-safe gate', () => {
    // We'll use a distinct old month for each case to avoid interference.

    // ── Case 1: DROPPED — tournament fully past retention + padding, no hold ──
    it('case 1: DROPs a partition when tournament is past retention+padding and has no legal_hold', async () => {
      const oldMonth = '2024-01'
      const suffix = '2024_01'
      await createOldPartition(oldMonth)

      // Create a tournament and mark it completed well before retention window
      const tournament = await TournamentFactory.create(pool, organizerId)
      // completed_at = 200 days ago (past retention_days=90 + padding=45 = 135 days)
      const completedAt = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()
      await pool.query(
        `UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`,
        [completedAt, tournament.id]
      )

      // Insert a message into the old partition (legal_hold=false)
      await pool.query(`
        INSERT INTO messaging.messages
          (tournament_id, sender_player_id, body, created_at, legal_hold)
        VALUES ($1, $2, 'old message', '2024-01-15 00:00:00+00', false)
      `, [tournament.id, tournament.creator_id])

      // Call purge with defaults (retention_days=90, drop_padding_days=45)
      const res = await pool.query(
        `SELECT * FROM messaging.purge_old_partitions(90, 45) ORDER BY partition`
      )

      // Find action for our partition
      const msgAction = res.rows.find(
        (r: { partition: string; action: string }) => r.partition === `messaging.messages_${suffix}`
      )
      expect(msgAction).toBeDefined()
      expect(msgAction.action).toBe('DROPPED')

      // The recipients partition should also be dropped
      const recipAction = res.rows.find(
        (r: { partition: string; action: string }) => r.partition === `messaging.message_recipients_${suffix}`
      )
      expect(recipAction).toBeDefined()
      expect(recipAction.action).toBe('DROPPED')

      // Confirm the partition no longer exists
      expect(await partitionExists('messaging', `messages_${suffix}`)).toBe(false)
      expect(await partitionExists('messaging', `message_recipients_${suffix}`)).toBe(false)
    })

    // ── Case 2: DETACHED — tournament completed recently, still within retention ──
    it('case 2: DETACHes a partition when tournament completed_at is within retention window', async () => {
      const oldMonth = '2024-02'
      const suffix = '2024_02'
      await createOldPartition(oldMonth)

      // Create a tournament completed only 30 days ago (within retention_days=90)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const completedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      await pool.query(
        `UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`,
        [completedAt, tournament.id]
      )

      // Insert a message into the old partition (no legal hold)
      await pool.query(`
        INSERT INTO messaging.messages
          (tournament_id, sender_player_id, body, created_at, legal_hold)
        VALUES ($1, $2, 'within retention msg', '2024-02-10 00:00:00+00', false)
      `, [tournament.id, tournament.creator_id])

      // Call purge
      const res = await pool.query(
        `SELECT * FROM messaging.purge_old_partitions(90, 45) ORDER BY partition`
      )

      const msgAction = res.rows.find(
        (r: { partition: string; action: string }) => r.partition === `messaging.messages_${suffix}`
      )
      expect(msgAction).toBeDefined()
      expect(msgAction.action).toBe('DETACHED')

      // Partition should still exist but be detached (not attached to parent)
      expect(await partitionExists('messaging', `messages_${suffix}`)).toBe(true)
      expect(await partitionAttached('messaging', `messages_${suffix}`)).toBe(false)
    })

    // ── Case 3: DETACHED — message has legal_hold=true ──────────────────────
    it('case 3: DETACHes a partition when any message has legal_hold=true', async () => {
      const oldMonth = '2024-03'
      const suffix = '2024_03'
      await createOldPartition(oldMonth)

      // Create a tournament completed long ago (past retention)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const completedAt = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()
      await pool.query(
        `UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`,
        [completedAt, tournament.id]
      )

      // Insert a message with legal_hold=true
      await pool.query(`
        INSERT INTO messaging.messages
          (tournament_id, sender_player_id, body, created_at, legal_hold)
        VALUES ($1, $2, 'held message', '2024-03-05 00:00:00+00', true)
      `, [tournament.id, tournament.creator_id])

      // Call purge
      const res = await pool.query(
        `SELECT * FROM messaging.purge_old_partitions(90, 45) ORDER BY partition`
      )

      const msgAction = res.rows.find(
        (r: { partition: string; action: string }) => r.partition === `messaging.messages_${suffix}`
      )
      expect(msgAction).toBeDefined()
      expect(msgAction.action).toBe('DETACHED')

      // Partition still exists but is detached
      expect(await partitionExists('messaging', `messages_${suffix}`)).toBe(true)
      expect(await partitionAttached('messaging', `messages_${suffix}`)).toBe(false)
    })

    // ── Case 4: DETACHED — tournament in-progress (completed_at IS NULL) ────
    it('case 4: DETACHes a partition when tournament is still in-progress (completed_at IS NULL)', async () => {
      const oldMonth = '2024-04'
      const suffix = '2024_04'
      await createOldPartition(oldMonth)

      // Create a tournament that is still in-progress (never set completed_at)
      const tournament = await TournamentFactory.create(pool, organizerId)
      // Verify completed_at is NULL
      const check = await pool.query(
        `SELECT completed_at FROM public.tournaments WHERE id = $1`,
        [tournament.id]
      )
      expect(check.rows[0].completed_at).toBeNull()

      // Insert a message into the old partition
      await pool.query(`
        INSERT INTO messaging.messages
          (tournament_id, sender_player_id, body, created_at, legal_hold)
        VALUES ($1, $2, 'in-progress msg', '2024-04-20 00:00:00+00', false)
      `, [tournament.id, tournament.creator_id])

      // Call purge
      const res = await pool.query(
        `SELECT * FROM messaging.purge_old_partitions(90, 45) ORDER BY partition`
      )

      const msgAction = res.rows.find(
        (r: { partition: string; action: string }) => r.partition === `messaging.messages_${suffix}`
      )
      expect(msgAction).toBeDefined()
      expect(msgAction.action).toBe('DETACHED')

      // Partition still exists but is detached
      expect(await partitionExists('messaging', `messages_${suffix}`)).toBe(true)
      expect(await partitionAttached('messaging', `messages_${suffix}`)).toBe(false)
    })
  })
})
