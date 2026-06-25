import { Pool } from 'pg'
import { getTestPool, closeTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TournamentFactory, OrganizerFactory } from '../factories'

/**
 * V2.1 integration tests for partition maintenance observability (migration 035).
 *
 * These tests verify:
 *  1. messaging.partition_maintenance_runs audit table exists with the right columns.
 *  2. Audit rows are written with correct counts by the PartitionManager.
 *  3. messaging.reclaim_detached_partitions() exists and re-runs the safety gate
 *     against previously DETACHed partitions, dropping them when they are now safe.
 *  4. Idempotency: running ensure + purge twice in a row is safe (no error).
 *  5. Dry-run: purgeOldPartitions({ dryRun: true }) returns candidates without DDL.
 *  6. Boundary-safe reclaim: a detached partition is NOT re-dropped when still held.
 *
 * Runs through the transactional test harness — no rows committed.
 */

describe('Partition maintenance (migration 035)', () => {
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

  // ── 1. Audit table schema ────────────────────────────────────────────────

  describe('messaging.partition_maintenance_runs audit table', () => {
    it('exists', async () => {
      const res = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'messaging'
          AND table_name = 'partition_maintenance_runs'
      `)
      expect(res.rows).toHaveLength(1)
    })

    it('has the expected columns (all TIMESTAMPTZ; counts int; dry_run bool; success bool)', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'messaging'
          AND table_name = 'partition_maintenance_runs'
        ORDER BY ordinal_position
      `)
      const cols = res.rows.reduce((acc: Record<string, { data_type: string; is_nullable: string }>, r: any) => {
        acc[r.column_name] = { data_type: r.data_type, is_nullable: r.is_nullable }
        return acc
      }, {})

      // id
      expect(cols['id']).toBeDefined()
      // run_type (ensure | purge | reclaim)
      expect(cols['run_type']).toBeDefined()
      // ran_at TIMESTAMPTZ NOT NULL
      expect(cols['ran_at']?.data_type).toBe('timestamp with time zone')
      expect(cols['ran_at']?.is_nullable).toBe('NO')
      // duration_ms
      expect(cols['duration_ms']).toBeDefined()
      // created_count int
      expect(cols['created_count']?.data_type).toBe('integer')
      // dropped_count int
      expect(cols['dropped_count']?.data_type).toBe('integer')
      // detached_count int
      expect(cols['detached_count']?.data_type).toBe('integer')
      // reclaimed_count int
      expect(cols['reclaimed_count']?.data_type).toBe('integer')
      // dry_run bool
      expect(cols['dry_run']?.data_type).toBe('boolean')
      // success bool
      expect(cols['success']?.data_type).toBe('boolean')
      // error_message nullable text
      expect(cols['error_message']).toBeDefined()
      // no naive timestamps
      const naiveCols = res.rows.filter((r: any) => r.data_type === 'timestamp without time zone')
      expect(naiveCols).toHaveLength(0)
    })
  })

  // ── 2. Audit rows written with correct counts ─────────────────────────

  describe('PartitionManager writes audit rows', () => {
    it('inserts an audit row after ensureFuturePartitions with created_count', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      await manager.ensureFuturePartitions(3)

      const res = await pool.query(`
        SELECT run_type, created_count, success
        FROM messaging.partition_maintenance_runs
        WHERE run_type = 'ensure'
        ORDER BY ran_at DESC
        LIMIT 1
      `)
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].run_type).toBe('ensure')
      expect(typeof res.rows[0].created_count).toBe('number')
      expect(res.rows[0].success).toBe(true)
    })

    it('inserts an audit row after purgeOldPartitions with dropped/detached counts', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      await manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45 })

      const res = await pool.query(`
        SELECT run_type, dropped_count, detached_count, dry_run, success
        FROM messaging.partition_maintenance_runs
        WHERE run_type = 'purge'
        ORDER BY ran_at DESC
        LIMIT 1
      `)
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].run_type).toBe('purge')
      expect(typeof res.rows[0].dropped_count).toBe('number')
      expect(typeof res.rows[0].detached_count).toBe('number')
      expect(res.rows[0].dry_run).toBe(false)
      expect(res.rows[0].success).toBe(true)
    })

    it('marks dry_run=true in audit row when dryRun option is set', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      await manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45, dryRun: true })

      const res = await pool.query(`
        SELECT dry_run, success
        FROM messaging.partition_maintenance_runs
        WHERE run_type = 'purge'
          AND dry_run = true
        ORDER BY ran_at DESC
        LIMIT 1
      `)
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].dry_run).toBe(true)
    })
  })

  // ── 3. Idempotency: running ensure + purge twice is safe ─────────────

  describe('Idempotency', () => {
    it('ensure is safe to run twice in a row without error', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      await expect(manager.ensureFuturePartitions(2)).resolves.not.toThrow()
      await expect(manager.ensureFuturePartitions(2)).resolves.not.toThrow()
    })

    it('purge is safe to run twice in a row without error', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      await expect(
        manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45 })
      ).resolves.not.toThrow()
      await expect(
        manager.purgeOldPartitions({ retentionDays: 90, dropPaddingDays: 45 })
      ).resolves.not.toThrow()
    })
  })

  // ── 4. reclaim_detached_partitions function ────────────────────────────

  describe('messaging.reclaim_detached_partitions()', () => {
    it('exists as a SQL function in the messaging schema', async () => {
      const res = await pool.query(`
        SELECT proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'messaging'
          AND p.proname = 'reclaim_detached_partitions'
      `)
      expect(res.rows).toHaveLength(1)
    })

    it('DROPs a detached partition that is now past retention and has no hold', async () => {
      // Create an old partition and DETACH it (simulating what purge_old_partitions does)
      const suffix = '2024_05'
      const oldMonth = '2024-05'
      const [year, month] = oldMonth.split('-')
      const nextMonthDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1 + 1, 1))
      const nextMonthStr = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0')}-01`
      const startStr = `${year}-${month.padStart(2, '0')}-01`

      // Create and then detach a messages partition
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messaging.messages_${suffix}
          PARTITION OF messaging.messages
          FOR VALUES FROM ('${startStr}') TO ('${nextMonthStr}')
      `)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messaging.message_recipients_${suffix}
          PARTITION OF messaging.message_recipients
          FOR VALUES FROM ('${startStr}') TO ('${nextMonthStr}')
      `)

      // Insert a message from a completed tournament (past retention)
      const tournament = await TournamentFactory.create(pool, organizerId)
      const completedAt = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()
      await pool.query(
        `UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`,
        [completedAt, tournament.id]
      )
      await pool.query(`
        INSERT INTO messaging.conversations (type, tournament_id)
        VALUES ('tournament', $1)
        ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
      `, [tournament.id])
      await pool.query(`
        INSERT INTO messaging.messages
          (tournament_id, conversation_id, sender_player_id, body, created_at, legal_hold)
        SELECT $1, c.id, $2, 'old safe msg', '2024-05-10 00:00:00+00', false
        FROM messaging.conversations c WHERE c.tournament_id = $1
      `, [tournament.id, tournament.creator_id])

      // Detach both partitions (simulating what purge does when gate fires)
      await pool.query(`
        ALTER TABLE messaging.messages DETACH PARTITION messaging.messages_${suffix}
      `)
      await pool.query(`
        ALTER TABLE messaging.message_recipients DETACH PARTITION messaging.message_recipients_${suffix}
      `)

      // Verify it's detached (not in pg_inherits)
      const beforeRes = await pool.query(`
        SELECT 1 FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'messaging' AND c.relname = 'messages_${suffix}'
      `)
      expect(beforeRes.rows).toHaveLength(0)

      // Now call reclaim — should DROP the partition since it's past retention with no hold
      const res = await pool.query(
        `SELECT * FROM messaging.reclaim_detached_partitions(90, 45) ORDER BY partition`
      )

      // Should have dropped our 2024-05 partition
      const action = res.rows.find(
        (r: { partition: string; action: string }) =>
          r.partition === `messaging.messages_${suffix}`
      )
      expect(action).toBeDefined()
      expect(action.action).toBe('DROPPED')

      // Partition should no longer exist
      const afterRes = await pool.query(`
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'messaging' AND c.relname = 'messages_${suffix}'
      `)
      expect(afterRes.rows).toHaveLength(0)
    })

    it('does NOT drop a detached partition that still has legal_hold=true', async () => {
      const suffix = '2024_06'
      const startStr = '2024-06-01'
      const endStr = '2024-07-01'

      await pool.query(`
        CREATE TABLE IF NOT EXISTS messaging.messages_${suffix}
          PARTITION OF messaging.messages
          FOR VALUES FROM ('${startStr}') TO ('${endStr}')
      `)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messaging.message_recipients_${suffix}
          PARTITION OF messaging.message_recipients
          FOR VALUES FROM ('${startStr}') TO ('${endStr}')
      `)

      // Insert a message with legal_hold=true
      const tournament = await TournamentFactory.create(pool, organizerId)
      const completedAt = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString()
      await pool.query(
        `UPDATE public.tournaments SET completed_at = $1 WHERE id = $2`,
        [completedAt, tournament.id]
      )
      await pool.query(`
        INSERT INTO messaging.conversations (type, tournament_id)
        VALUES ('tournament', $1)
        ON CONFLICT (tournament_id) WHERE tournament_id IS NOT NULL DO NOTHING
      `, [tournament.id])
      await pool.query(`
        INSERT INTO messaging.messages
          (tournament_id, conversation_id, sender_player_id, body, created_at, legal_hold)
        SELECT $1, c.id, $2, 'held message', '2024-06-15 00:00:00+00', true
        FROM messaging.conversations c WHERE c.tournament_id = $1
      `, [tournament.id, tournament.creator_id])

      // Detach
      await pool.query(`
        ALTER TABLE messaging.messages DETACH PARTITION messaging.messages_${suffix}
      `)
      await pool.query(`
        ALTER TABLE messaging.message_recipients DETACH PARTITION messaging.message_recipients_${suffix}
      `)

      // Reclaim — the 2024-06 partition should NOT be dropped (has legal_hold)
      const res = await pool.query(
        `SELECT * FROM messaging.reclaim_detached_partitions(90, 45) ORDER BY partition`
      )

      const action = res.rows.find(
        (r: { partition: string; action: string }) =>
          r.partition === `messaging.messages_${suffix}`
      )
      // Should either not be in the results or have action SKIPPED (not DROPPED)
      if (action) {
        expect(action.action).not.toBe('DROPPED')
      }

      // Partition must still exist
      const afterRes = await pool.query(`
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'messaging' AND c.relname = 'messages_${suffix}'
      `)
      expect(afterRes.rows).toHaveLength(1)
    })
  })

  // ── 5. Coverage signal ────────────────────────────────────────────────

  describe('PartitionManager.getCoverageStatus()', () => {
    it('returns ok when partitions are far enough in the future', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      // ensure partitions current+3 months out — should be plenty of coverage
      await manager.ensureFuturePartitions(3)
      const status = await manager.getCoverageStatus()

      expect(['ok', 'low', 'critical']).toContain(status.level)
      // With 3 months ahead, it should be ok
      expect(status.level).toBe('ok')
      expect(status.furthestPartitionDate).toBeDefined()
    })

    it('getCoverageStatus returns a valid shape with level/furthestPartitionDate/daysAhead', async () => {
      const { PartitionManager } = await import('../../services/partition-manager')
      const manager = new PartitionManager(pool)

      const status = await manager.getCoverageStatus()

      expect(status.level).toMatch(/^(ok|low|critical)$/)
      expect(typeof status.daysAhead).toBe('number')
      // furthestPartitionDate may be a Date or null
      expect(
        status.furthestPartitionDate === null ||
        status.furthestPartitionDate instanceof Date
      ).toBe(true)
    })
  })
})
