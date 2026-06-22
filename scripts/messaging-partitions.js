#!/usr/bin/env node
/**
 * messaging-partitions.js — CLI for messaging partition lifecycle management.
 *
 * Usage:
 *   node scripts/messaging-partitions.js --ensure
 *     Pre-create aligned monthly partitions for current + 2 future months (idempotent).
 *
 *   node scripts/messaging-partitions.js --purge
 *     Run the boundary-safe purge: DROPs old safe partitions, DETACHes unsafe ones.
 *
 *   node scripts/messaging-partitions.js --purge --dry-run
 *     Show which partitions WOULD be considered for purge without executing DDL.
 *
 * Environment:
 *   DATABASE_URL — Postgres connection string
 *     Default: postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app
 */
import pg from 'pg'

const { Pool } = pg

// Color output
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
}

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`)
}

async function runEnsure(pool) {
  log('\nEnsuring future partitions...', 'blue')
  const client = await pool.connect()
  try {
    const res = await client.query('SELECT messaging.ensure_future_partitions(2)')
    log('Future partitions ensured (current + 2 months ahead).', 'green')

    // Show resulting partition list
    const parts = await client.query(`
      SELECT child.relname AS name
      FROM pg_inherits i
      JOIN pg_class parent ON parent.oid = i.inhparent
      JOIN pg_class child  ON child.oid  = i.inhrelid
      JOIN pg_namespace n  ON n.oid = parent.relnamespace
      WHERE n.nspname = 'messaging'
        AND parent.relname IN ('messages', 'message_recipients')
      ORDER BY child.relname
    `)
    log('\nAttached partitions:', 'blue')
    for (const row of parts.rows) {
      log(`  messaging.${row.name}`, 'dim')
    }
  } finally {
    client.release()
  }
}

async function runPurge(pool, dryRun) {
  if (dryRun) {
    log('\nDry-run: scanning for partition purge candidates (no DDL executed)...', 'yellow')
    const client = await pool.connect()
    try {
      // Find partitions older than retention + padding days.
      // We compute the cutoff and compare against each partition's upper bound.
      const cutoffDays = 90 + 45 // retention_days + drop_padding_days
      const res = await client.query(`
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
            substring(pg_get_expr(c.relpartbound, c.oid, true)
              FROM $1)::timestamptz
            <= now() - ($2 * interval '1 day')
          )
        ORDER BY child.relname
      `, ["TO \\('([^']+)'\\)", cutoffDays])

      if (res.rows.length === 0) {
        log('No partitions old enough to consider for purge.', 'green')
      } else {
        log(`\n${res.rows.length} partition(s) would be evaluated:`, 'yellow')
        for (const row of res.rows) {
          log(`  [DRY-RUN] ${row.partition}`, 'yellow')
        }
        log('\nRun without --dry-run to execute the boundary-safe purge.', 'dim')
      }
    } finally {
      client.release()
    }
    return
  }

  log('\nRunning boundary-safe partition purge...', 'blue')
  const client = await pool.connect()
  try {
    const res = await client.query(
      'SELECT * FROM messaging.purge_old_partitions($1, $2) ORDER BY partition',
      [90, 45]
    )
    if (res.rows.length === 0) {
      log('No partitions were old enough to purge.', 'green')
      return
    }
    log(`\n${res.rows.length} action(s) taken:`, 'blue')
    for (const row of res.rows) {
      const color = row.action === 'DROPPED' ? 'red' : 'yellow'
      log(`  [${row.action}] ${row.partition}`, color)
    }
    const dropped = res.rows.filter((r) => r.action === 'DROPPED').length
    const detached = res.rows.filter((r) => r.action === 'DETACHED').length
    log(`\nSummary: ${dropped} dropped, ${detached} detached.`, 'green')
  } finally {
    client.release()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const doEnsure = args.includes('--ensure')
  const doPurge = args.includes('--purge')
  const dryRun = args.includes('--dry-run')

  if (!doEnsure && !doPurge) {
    log('Usage:', 'blue')
    log('  node scripts/messaging-partitions.js --ensure', 'dim')
    log('  node scripts/messaging-partitions.js --purge [--dry-run]', 'dim')
    process.exit(1)
  }

  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

  const pool = new Pool({ connectionString })

  try {
    if (doEnsure) {
      await runEnsure(pool)
    }
    if (doPurge) {
      await runPurge(pool, dryRun)
    }
    log('\nDone.', 'green')
  } catch (err) {
    log(`\nError: ${err.message}`, 'red')
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
