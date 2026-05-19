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
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations')
    await runMigrations(testPool, migrationsDir)
  } catch (err) {
    await testPool.end()
    testPool = null
    throw err
  }

  return testPool
}

export async function resetTestDb(pool: Pool): Promise<void> {
  try {
    // Drop and recreate schemas for clean test state
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE')
    await pool.query('DROP SCHEMA IF EXISTS auth CASCADE')
    await pool.query('CREATE SCHEMA public')
    await pool.query('CREATE SCHEMA auth')

    // Re-run migrations
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations')
    await runMigrations(pool, migrationsDir)
  } catch (err) {
    console.error('Failed to reset test database:', err)
    throw err
  }
}

export async function closeTestDb(): Promise<void> {
  if (testPool) {
    await testPool.end()
    testPool = null
  }
}
