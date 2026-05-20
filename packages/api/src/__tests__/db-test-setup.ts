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
  try {
    // Drop all objects in public schema (except schema_migrations table)
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Drop all tables except schema_migrations
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'schema_migrations') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;

        -- Drop all sequences
        FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
        END LOOP;

        -- Drop all types (except built-in ones)
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype IN ('c', 'e')) LOOP
          EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `)

    // Clear migrations tracking to re-run them
    await pool.query('DELETE FROM public.schema_migrations')

    // Drop and recreate auth schema
    await pool.query('DROP SCHEMA IF EXISTS auth CASCADE')
    await pool.query('CREATE SCHEMA auth')

    // Re-run migrations
    const migrationsDir = path.resolve(__dirname, '../../../../db/migrations')
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
