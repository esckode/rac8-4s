import { Pool, PoolClient } from 'pg'
import path from 'path'
import { runMigrations } from '../../migrations'

/**
 * Test database harness with true per-suite isolation.
 *
 * A single real connection ("the suite connection") is opened in beginTransaction()
 * and wrapped in an outer BEGIN. Everything in the suite — the app (via deps.db),
 * factories, and direct repository reads — runs through this one connection so that
 * reads always see writes, and afterAll's ROLLBACK discards everything. Nothing is
 * ever committed to the shared database, so tests do not pollute it.
 *
 * Two facades sit in front of the suite connection:
 *  - getTestPool() returns a Pool-shaped proxy (handed to factories and direct repos).
 *  - getTransactionClient() returns a PoolClient-shaped facade (wired into the app as
 *    deps.db, and used by repository transaction helpers).
 * Both delegate to the same serialized, savepoint-translating executor below.
 *
 * Serialization: a single pg connection cannot run queries concurrently, but specs do
 * `await Promise.all([Factory.create(pool), ...])`. All queries on the suite connection
 * are funneled through one promise chain so they execute one at a time.
 *
 * Savepoint translation: repository transaction helpers issue BEGIN/COMMIT/ROLLBACK on
 * whatever connection they are given. On the suite connection these are rewritten to
 * SAVEPOINT / RELEASE SAVEPOINT / ROLLBACK TO SAVEPOINT so a nested repo "transaction"
 * never commits or aborts the outer suite transaction.
 */

let realPool: Pool | null = null
let proxyPool: Pool | null = null
let suiteClient: PoolClient | null = null
let txFacade: PoolClient | null = null
let savepointDepth = 0
let statementCounter = 0
let queue: Promise<unknown> = Promise.resolve()

/** Run fns one at a time against the single suite connection. */
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(() => fn(), () => fn())
  queue = run.then(() => undefined, () => undefined)
  return run
}

/** Execute one statement on the suite connection, translating transaction control. */
async function execOnSuite(text: any, params?: any): Promise<any> {
  const client = suiteClient!
  if (typeof text === 'string') {
    const norm = text.trim().replace(/;+$/, '').toUpperCase()
    if (norm === 'BEGIN') {
      savepointDepth++
      return client.query(`SAVEPOINT sp_${savepointDepth}`)
    }
    if (norm === 'COMMIT') {
      if (savepointDepth === 0) return { rows: [], rowCount: 0 }
      const sp = savepointDepth--
      return client.query(`RELEASE SAVEPOINT sp_${sp}`)
    }
    if (norm === 'ROLLBACK') {
      if (savepointDepth === 0) return { rows: [], rowCount: 0 }
      const sp = savepointDepth--
      await client.query(`ROLLBACK TO SAVEPOINT sp_${sp}`)
      return client.query(`RELEASE SAVEPOINT sp_${sp}`)
    }
  }

  // Inside an explicit repo transaction (BEGIN issued), a failed statement is already
  // recovered by that method's own ROLLBACK (translated to ROLLBACK TO SAVEPOINT), so
  // pass through. A bare statement, however, would abort the whole shared suite
  // transaction on error (e.g. a unique-constraint violation), cascading "current
  // transaction is aborted" into every later test. Wrap it in its own savepoint so a
  // failure rolls back only itself; the error still propagates to the caller.
  if (savepointDepth > 0) {
    return client.query(text, params)
  }

  const sp = `stmt_${++statementCounter}`
  await client.query(`SAVEPOINT ${sp}`)
  try {
    const result = await client.query(text, params)
    await client.query(`RELEASE SAVEPOINT ${sp}`)
    return result
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`)
    await client.query(`RELEASE SAVEPOINT ${sp}`)
    throw err
  }
}

/**
 * A PoolClient-shaped facade over the suite connection. release() is a no-op, and
 * connect() returns the same facade, so repository code that calls `pool.connect()`
 * to run a transaction joins the suite connection instead of opening a new one.
 */
function getTxFacade(): PoolClient {
  if (!txFacade) {
    txFacade = {
      query: (text: any, params?: any) => serialize(() => execOnSuite(text, params)),
      connect: async () => getTxFacade(),
      release: () => { /* suite owns this connection; do not release mid-suite */ },
    } as unknown as PoolClient
  }
  return txFacade
}

function createProxyPool(): Pool {
  const proxy = {
    query: (text: any, params?: any) =>
      suiteClient ? getTxFacade().query(text, params) : realPool!.query(text, params),
    connect: async () => (suiteClient ? getTxFacade() : realPool!.connect()),
    end: () => realPool!.end(),
  }
  return proxy as unknown as Pool
}

/**
 * Get or create the test database harness.
 * Runs migrations on first call. Returns a transactional proxy pool.
 */
export async function getTestPool(): Promise<Pool> {
  if (proxyPool) {
    return proxyPool
  }

  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL ||
    'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

  realPool = new Pool({
    connectionString,
    min: 0,
    max: 10,
  })

  try {
    const migrationsDir = path.resolve(__dirname, '../../../../../db/migrations')
    await runMigrations(realPool, migrationsDir)
  } catch (err) {
    await realPool.end()
    realPool = null
    throw err
  }

  proxyPool = createProxyPool()
  return proxyPool
}

/**
 * Begin the per-suite transaction. All queries within the suite run on a single
 * connection wrapped in this outer transaction. Call once in beforeAll.
 */
export async function beginTransaction(_pool?: Pool): Promise<PoolClient> {
  if (suiteClient) {
    throw new Error('Transaction already active')
  }
  if (!realPool) {
    throw new Error('Test pool not initialized; call getTestPool() first')
  }
  suiteClient = await realPool.connect()
  savepointDepth = 0
  statementCounter = 0
  queue = Promise.resolve()
  txFacade = null
  await suiteClient.query('BEGIN')
  return getTxFacade()
}

/**
 * Roll back the per-suite transaction, discarding all changes. Call in afterAll.
 */
export async function rollbackTransaction(): Promise<void> {
  if (!suiteClient) {
    throw new Error('No active transaction')
  }
  // Let any in-flight serialized queries settle before rolling back.
  await queue.catch(() => undefined)
  try {
    await suiteClient.query('ROLLBACK')
  } finally {
    suiteClient.release()
    suiteClient = null
    txFacade = null
    savepointDepth = 0
    queue = Promise.resolve()
  }
}

/**
 * Get the active suite connection facade (PoolClient-shaped), or null if no
 * transaction is active. Wired into the app as deps.db and used by repositories.
 */
export function getTransactionClient(): PoolClient | null {
  return suiteClient ? getTxFacade() : null
}

/**
 * Close the underlying real pool. Call in global afterAll.
 */
export async function closeTestPool(): Promise<void> {
  if (realPool) {
    try {
      await realPool.end()
    } catch (err) {
      // Pool already closed, ignore
    }
    realPool = null
    proxyPool = null
  }
}
