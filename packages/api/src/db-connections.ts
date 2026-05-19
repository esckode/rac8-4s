import { Pool } from 'pg'

let poolInstance: Pool | null = null

export function getDb(): Pool {
  if (!poolInstance) {
    throw new Error('Database pool not initialized. Call initializeDb() first.')
  }
  return poolInstance
}

export async function initializeDb(): Promise<Pool> {
  if (poolInstance) {
    return poolInstance
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  poolInstance = new Pool({
    connectionString: databaseUrl,
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  // Test the connection
  const client = await poolInstance.connect()
  try {
    const result = await client.query('SELECT NOW()')
    console.log('✅ Database connected:', result.rows[0])
  } finally {
    client.release()
  }

  return poolInstance
}

export async function closeDb(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end()
    poolInstance = null
  }
}
