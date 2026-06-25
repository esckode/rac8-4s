import { Pool } from 'pg'
import { getLogger } from '../logger'

const log = getLogger('partition-manager')

export interface PartitionAction {
  partition: string
  action: 'DROPPED' | 'DETACHED'
}

export interface PurgeOptions {
  /** Days to retain messages after tournament completion. Default: 90 */
  retentionDays?: number
  /** Additional padding days before dropping (to let late-arriving rows settle). Default: 45 */
  dropPaddingDays?: number
  /** When true, compute and return would-be actions without executing any DDL. */
  dryRun?: boolean
}

export type CoverageLevel = 'ok' | 'low' | 'critical'

export interface CoverageStatus {
  level: CoverageLevel
  furthestPartitionDate: Date | null
  daysAhead: number
}

/** Days ahead threshold below which coverage is 'low' (warn). */
const COVERAGE_LOW_THRESHOLD_DAYS = 60
/** Days ahead threshold below which coverage is 'critical' (emergency warn). */
const COVERAGE_CRITICAL_THRESHOLD_DAYS = 30

export class PartitionManager {
  constructor(private readonly pool: Pool) {}

  /**
   * Idempotently create aligned partitions for the current month + next months_ahead months.
   * Delegates to messaging.ensure_future_partitions(months_ahead).
   * Writes an audit row to messaging.partition_maintenance_runs.
   */
  async ensureFuturePartitions(monthsAhead = 2): Promise<void> {
    const started = Date.now()
    log.info('partition.ensure.start', { monthsAhead })

    let createdCount = 0
    let error: string | undefined

    try {
      // Count partitions before to compute created_count
      const before = await this._countAttachedPartitions()
      await this.pool.query(
        `SELECT messaging.ensure_future_partitions($1)`,
        [monthsAhead]
      )
      const after = await this._countAttachedPartitions()
      createdCount = Math.max(0, after - before)

      log.info('partition.ensure.done', { monthsAhead, createdCount })
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      log.error('partition.ensure.failed', { monthsAhead, message: error })
      await this._writeAudit({
        runType: 'ensure',
        durationMs: Date.now() - started,
        createdCount: 0,
        success: false,
        error,
      })
      throw err
    }

    await this._writeAudit({
      runType: 'ensure',
      durationMs: Date.now() - started,
      createdCount,
      success: true,
    })
  }

  /**
   * Run the boundary-safe purge.
   *
   * In live mode: calls messaging.purge_old_partitions(retention_days, drop_padding_days)
   * and returns the set of (partition, action) rows actually executed.
   *
   * In dry-run mode: queries which partitions WOULD be considered (older than cutoff)
   * but does not call the purge function, so no DDL is executed.
   */
  async purgeOldPartitions(options: PurgeOptions = {}): Promise<PartitionAction[]> {
    const retentionDays = options.retentionDays ?? 90
    const dropPaddingDays = options.dropPaddingDays ?? 45
    const dryRun = options.dryRun ?? false
    const started = Date.now()

    let actions: PartitionAction[] = []
    let error: string | undefined

    try {
      if (dryRun) {
        log.info('partition.purge.dryrun', { retentionDays, dropPaddingDays })
        // Return candidates that are old enough to consider, without executing DDL.
        const res = await this.pool.query<{ partition: string }>(
          `
          SELECT n.nspname || '.' || child.relname AS partition
          FROM pg_inherits i
          JOIN pg_class parent ON parent.oid = i.inhparent
          JOIN pg_class child  ON child.oid  = i.inhrelid
          JOIN pg_namespace n  ON n.oid = child.relnamespace
          JOIN pg_namespace pn ON pn.oid = parent.relnamespace
          JOIN pg_class c      ON c.oid = child.oid
          WHERE pn.nspname = 'messaging'
            AND parent.relname = 'messages'
            AND (
              substring(pg_get_expr(c.relpartbound, c.oid, true) FROM $1)::timestamptz
              <= now() - ($2 * interval '1 day')
            )
          ORDER BY child.relname
          `,
          ["TO \\('([^']+)'\\)", retentionDays + dropPaddingDays]
        )
        actions = res.rows.map((r) => ({ partition: r.partition, action: 'DRY_RUN' as unknown as 'DROPPED' }))
      } else {
        log.info('partition.purge.start', { retentionDays, dropPaddingDays })
        const res = await this.pool.query<PartitionAction>(
          `SELECT * FROM messaging.purge_old_partitions($1, $2)`,
          [retentionDays, dropPaddingDays]
        )
        actions = res.rows
        const dropped = actions.filter((r) => r.action === 'DROPPED').length
        const detached = actions.filter((r) => r.action === 'DETACHED').length
        log.info('partition.purge.done', { dropped, detached })
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      log.error('partition.purge.failed', { retentionDays, dropPaddingDays, dryRun, message: error })
      await this._writeAudit({
        runType: 'purge',
        durationMs: Date.now() - started,
        droppedCount: 0,
        detachedCount: 0,
        dryRun,
        success: false,
        error,
      })
      throw err
    }

    const dropped = actions.filter((r) => r.action === 'DROPPED').length
    const detached = actions.filter((r) => r.action === 'DETACHED').length

    await this._writeAudit({
      runType: 'purge',
      durationMs: Date.now() - started,
      droppedCount: dropped,
      detachedCount: detached,
      dryRun,
      success: true,
    })

    return actions
  }

  /**
   * Re-run the boundary-safe gate against previously DETACHed partitions.
   * Drops them if now safe (tournament past retention, no legal_hold).
   * Writes an audit row with reclaimed_count.
   */
  async reclaimDetachedPartitions(options: Pick<PurgeOptions, 'retentionDays' | 'dropPaddingDays'> = {}): Promise<PartitionAction[]> {
    const retentionDays = options.retentionDays ?? 90
    const dropPaddingDays = options.dropPaddingDays ?? 45
    const started = Date.now()

    log.info('partition.reclaim.start', { retentionDays, dropPaddingDays })
    let actions: PartitionAction[] = []
    let error: string | undefined

    try {
      const res = await this.pool.query<PartitionAction>(
        `SELECT * FROM messaging.reclaim_detached_partitions($1, $2)`,
        [retentionDays, dropPaddingDays]
      )
      actions = res.rows
      const reclaimed = actions.filter((r) => r.action === 'DROPPED').length
      log.info('partition.reclaim.done', { reclaimed })
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      log.error('partition.reclaim.failed', { retentionDays, dropPaddingDays, message: error })
      await this._writeAudit({
        runType: 'reclaim',
        durationMs: Date.now() - started,
        reclaimedCount: 0,
        success: false,
        error,
      })
      throw err
    }

    const reclaimed = actions.filter((r) => r.action === 'DROPPED').length
    await this._writeAudit({
      runType: 'reclaim',
      durationMs: Date.now() - started,
      reclaimedCount: reclaimed,
      success: true,
    })

    return actions
  }

  /**
   * Check partition coverage: how far ahead are the furthest-future attached partitions?
   * Returns ok / low / critical based on distance from now().
   * Emits warn logs for low/critical; wires into /health.
   */
  async getCoverageStatus(): Promise<CoverageStatus> {
    // Find the MAX range end across attached messaging.messages partitions.
    // The range bound expression gives us "FOR VALUES FROM (...) TO (...)"
    // The regex pattern 'TO \\(''([^'']+)''\\)' extracts the TO date from the
    // partition bound expression "FOR VALUES FROM ('YYYY-MM-DD') TO ('YYYY-MM-DD')".
    // Double backslash in TS template literal → single backslash in SQL string →
    // POSIX regex literal-paren escape: \( means literal ( in Postgres regex.
    const res = await this.pool.query<{ max_end: string | null }>(`
      SELECT max(
        substring(pg_get_expr(c.relpartbound, c.oid, true) FROM 'TO \\(''([^'']+)''\\)')::timestamptz
      ) AS max_end
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_class child  ON child.oid  = i.inhrelid
      JOIN pg_class c      ON c.oid = child.oid
      JOIN pg_namespace pn ON pn.oid = parent.relnamespace
      JOIN pg_namespace n  ON n.oid = child.relnamespace
      WHERE pn.nspname = 'messaging'
        AND parent.relname = 'messages'
    `)

    const maxEndRaw = res.rows[0]?.max_end ?? null
    const furthestPartitionDate = maxEndRaw ? new Date(maxEndRaw) : null
    const now = new Date()
    const daysAhead = furthestPartitionDate
      ? Math.floor((furthestPartitionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    let level: CoverageLevel
    if (!furthestPartitionDate || daysAhead < COVERAGE_CRITICAL_THRESHOLD_DAYS) {
      level = 'critical'
      log.warn('partition.coverage.critical', { daysAhead, furthestPartitionDate })
    } else if (daysAhead < COVERAGE_LOW_THRESHOLD_DAYS) {
      level = 'low'
      log.warn('partition.coverage.low', { daysAhead, furthestPartitionDate })
    } else {
      level = 'ok'
      log.debug('partition.coverage.ok', { daysAhead, furthestPartitionDate })
    }

    return { level, furthestPartitionDate, daysAhead }
  }

  /** Count currently attached partitions under messaging.messages. */
  private async _countAttachedPartitions(): Promise<number> {
    const res = await this.pool.query<{ cnt: string }>(`
      SELECT COUNT(*) AS cnt
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_namespace pn ON pn.oid = parent.relnamespace
      WHERE pn.nspname = 'messaging'
        AND parent.relname = 'messages'
    `)
    return parseInt(res.rows[0]?.cnt ?? '0', 10)
  }

  /** Write a row to messaging.partition_maintenance_runs. */
  private async _writeAudit(opts: {
    runType: 'ensure' | 'purge' | 'reclaim'
    durationMs: number
    createdCount?: number
    droppedCount?: number
    detachedCount?: number
    reclaimedCount?: number
    dryRun?: boolean
    success: boolean
    error?: string
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO messaging.partition_maintenance_runs
           (run_type, ran_at, duration_ms, created_count, dropped_count,
            detached_count, reclaimed_count, dry_run, success, error_message)
         VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          opts.runType,
          opts.durationMs,
          opts.createdCount ?? 0,
          opts.droppedCount ?? 0,
          opts.detachedCount ?? 0,
          opts.reclaimedCount ?? 0,
          opts.dryRun ?? false,
          opts.success,
          opts.error ?? null,
        ]
      )
    } catch (auditErr) {
      // Audit write failure must never mask the real error
      log.error('partition.audit.write.failed', {
        message: auditErr instanceof Error ? auditErr.message : String(auditErr),
      })
    }
  }
}
