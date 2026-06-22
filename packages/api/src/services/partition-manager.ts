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

export class PartitionManager {
  constructor(private readonly pool: Pool) {}

  /**
   * Idempotently create aligned partitions for the current month + next months_ahead months.
   * Delegates to messaging.ensure_future_partitions(months_ahead).
   */
  async ensureFuturePartitions(monthsAhead = 2): Promise<void> {
    log.info('partition.ensure.start', { monthsAhead })
    await this.pool.query(
      `SELECT messaging.ensure_future_partitions($1)`,
      [monthsAhead]
    )
    log.info('partition.ensure.done', { monthsAhead })
  }

  /**
   * Run the boundary-safe purge.
   *
   * In live mode: calls messaging.purge_old_partitions(retention_days, drop_padding_days)
   * and returns the set of (partition, action) rows actually executed.
   *
   * In dry-run mode: queries which partitions WOULD be considered (older than cutoff)
   * but does not call the purge function, so no DDL is executed.
   * Returns rows with an additional field indicating whether they would be DROPPED or
   * DETACHED based on the boundary gate, but since evaluating the gate requires the
   * full SQL function, dry-run simply lists candidates with action='DRY_RUN'.
   */
  async purgeOldPartitions(options: PurgeOptions = {}): Promise<PartitionAction[]> {
    const retentionDays = options.retentionDays ?? 90
    const dropPaddingDays = options.dropPaddingDays ?? 45
    const dryRun = options.dryRun ?? false

    if (dryRun) {
      log.info('partition.purge.dryrun', { retentionDays, dropPaddingDays })
      // Return candidates that are old enough to consider, without executing DDL.
      // The regex extracts the TO date from the partition bound expression.
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
      return res.rows.map((r) => ({ partition: r.partition, action: 'DRY_RUN' as unknown as 'DROPPED' }))
    }

    log.info('partition.purge.start', { retentionDays, dropPaddingDays })
    const res = await this.pool.query<PartitionAction>(
      `SELECT * FROM messaging.purge_old_partitions($1, $2)`,
      [retentionDays, dropPaddingDays]
    )
    const actions = res.rows
    const dropped = actions.filter((r) => r.action === 'DROPPED').length
    const detached = actions.filter((r) => r.action === 'DETACHED').length
    log.info('partition.purge.done', { dropped, detached })
    return actions
  }
}
