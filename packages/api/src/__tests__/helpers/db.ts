import { Pool, PoolClient } from 'pg'
import path from 'path'
import { runMigrations } from '../../migrations'

let testPool: Pool | null = null
let transactionClient: PoolClient | null = null

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
 * Begin a database transaction for test suite isolation.
 * All queries within the suite use the same transaction.
 * Provides true database-level isolation without truncation.
 * Call once in beforeAll.
 */
export async function beginTransaction(pool: Pool) {
  if (transactionClient) {
    throw new Error('Transaction already active')
  }
  transactionClient = await pool.connect()
  await transactionClient.query('BEGIN')
  return transactionClient
}

/**
 * Rollback the active transaction.
 * All changes within the suite are discarded.
 * Call in afterAll.
 */
export async function rollbackTransaction(): Promise<void> {
  if (!transactionClient) {
    throw new Error('No active transaction')
  }
  try {
    await transactionClient.query('ROLLBACK')
  } finally {
    transactionClient.release()
    transactionClient = null
  }
}

/**
 * Get the active transaction client for this test suite.
 * If a transaction is active, returns the client.
 * Otherwise returns null (pool should be used instead).
 */
export function getTransactionClient(): PoolClient | null {
  return transactionClient
}

/**
 * Close the test pool.
 * Call in global afterAll.
 */
export async function closeTestPool(): Promise<void> {
  if (testPool) {
    try {
      await testPool.end()
    } catch (err) {
      // Pool already closed, ignore
    }
    testPool = null
  }
}
