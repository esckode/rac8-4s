import { Pool } from 'pg'
import path from 'path'
import { runMigrations } from '../../migrations'

let testPool: Pool | null = null

/**
 * Get or create the test database pool.
 * Runs migrations on first call.
 */
export async function getTestPool(): Promise<Pool> {
  if (testPool) {
    return testPool
  }

  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL ||
    'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

  testPool = new Pool({
    connectionString,
    min: 0,
    max: 10,
  })

  try {
    const migrationsDir = path.resolve(__dirname, '../../../../../db/migrations')
    await runMigrations(testPool, migrationsDir)
  } catch (err) {
    await testPool.end()
    testPool = null
    throw err
  }

  return testPool
}

/**
 * Truncate all non-migration tables in dependency order.
 * Call once in global beforeAll (or per-suite beforeAll).
 * Do NOT call in beforeEach - this is what kills parallel performance.
 */
export async function truncateAll(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    // Truncate children before parents (respect FK constraints)
    const tablesToTruncate = [
      'auth.password_reset_codes',
      'auth.accounts',
      'public.user_events',
      'public.knockout_matches',
      'public.bracket_seeds',
      'public.group_matches',
      'public.group_memberships',
      'public.groups',
      'public.player_registrations',
      'public.courts',
      'public.locations',
      'public.players',
      'public.tournaments',
    ]

    for (const table of tablesToTruncate) {
      try {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`)
      } catch (err: any) {
        // Table might not exist yet, that's fine
        if (!err.message?.includes('does not exist')) {
          throw err
        }
      }
    }

    // Clear migration record (but keep schema_migrations table structure)
    await client.query('DELETE FROM public.schema_migrations')
  } finally {
    client.release()
  }
}

/**
 * Close the test pool.
 * Call in global afterAll.
 */
export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end()
    testPool = null
  }
}
