import { Pool } from 'pg'
import { runMigrations } from '../migrations'
import path from 'node:path'

let testPool: Pool | null = null

export async function initializeTestDb(): Promise<Pool> {
  if (testPool) {
    return testPool
  }

  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL ||
    'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

  testPool = new Pool({
    connectionString,
    min: 1,
    max: 2,
  })

  try {
    // Run migrations
    const migrationsDir = path.resolve(__dirname, '../../../../db/migrations')
    await runMigrations(testPool, migrationsDir)
  } catch (err) {
    await testPool.end()
    testPool = null
    throw err
  }

  return testPool
}

export async function resetTestDb(pool: Pool): Promise<void> {
  const maxRetries = 3
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const client = await pool.connect()
    try {
      // Use TRUNCATE CASCADE to automatically handle all foreign key constraints
      // Query for all tables in both auth and public schemas and truncate them
      const allTables = await client.query(`
        SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname IN ('auth', 'public') AND tablename != 'schema_migrations'
        ORDER BY schemaname, tablename
      `)

      // TRUNCATE all tables with CASCADE to handle FK constraints
      for (const row of allTables.rows) {
        try {
          await client.query(`TRUNCATE TABLE "${row.schemaname}"."${row.tablename}" CASCADE`)
        } catch (err: any) {
          // Table might have been deleted, that's okay
          if (!err.message?.includes('does not exist')) {
            throw err
          }
        }
      }

      // Delete all migration records (preserves table structure for re-migration)
      await client.query('DELETE FROM public.schema_migrations')

      // Re-run migrations to restore schema structure
      const migrationsDir = path.resolve(__dirname, '../../../../db/migrations')
      await runMigrations(pool, migrationsDir)

      client.release()
      return // Success - exit function
    } catch (err: any) {
      lastError = err
      client.release()

      // If deadlock detected, retry with exponential backoff
      if (err.message?.includes('deadlock') && attempt < maxRetries - 1) {
        const delayMs = Math.min(1000, 50 * Math.pow(2, attempt))
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }

      // For other errors, throw immediately
      throw err
    }
  }

  // If we got here, all retries failed
  console.error('Failed to reset test database after retries:', lastError)
  throw lastError
}

export async function closeTestDb(): Promise<void> {
  if (testPool) {
    await testPool.end()
    testPool = null
  }
}

/**
 * Error simulation helpers for testing error scenarios
 */
const originalQuery = Pool.prototype.query

export function mockPoolQueryError(pool: Pool, error: Error): void {
  ;(pool.query as any) = jest.fn(async () => {
    throw error
  })
}

export function mockPoolQueryTimeout(pool: Pool, delayMs: number = 100): void {
  ;(pool.query as any) = jest.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    throw new Error('ETIMEDOUT')
  })
}

export function mockPoolConnect(pool: Pool, error: Error): void {
  ;(pool.connect as any) = jest.fn(async () => {
    throw error
  })
}

export function restorePoolQuery(pool: Pool): void {
  ;(pool.query as any) = originalQuery
}

export function restorePoolConnect(pool: Pool): void {
  ;(pool.connect as any) = (Pool.prototype as any).connect
}
