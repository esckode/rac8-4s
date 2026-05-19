import http from 'node:http'
import path from 'node:path'
import { createApp } from './app'
import { initializeDb, closeDb } from './db-connections'
import { runMigrations } from './migrations'
import { InMemoryTokenStore } from './auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { BroadcastBus } from './broadcast-bus'
import { DEFAULT_APP_CONFIG } from './config'

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001

async function main() {
  try {
    console.log(`🚀 Starting API server on port ${PORT}...`)

    // Initialize database pool
    const pool = await initializeDb()

    // Run migrations
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations')
    await runMigrations(pool, migrationsDir)

    // Initialize dependencies
    const tokenStore = new InMemoryTokenStore()
    const jobQueue = new InMemoryJobQueue()
    const broadcastBus = new BroadcastBus()

    // Create Express app
    const app = createApp({
      config: DEFAULT_APP_CONFIG,
      db: pool,
      jwtConfig: { secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production', expiresInSeconds: 3600 },
      tokenStore,
      jobQueue,
      broadcastBus,
    })

    // Add health check endpoint
    app.get('/health', async (req, res) => {
      try {
        const client = await pool.connect()
        try {
          await client.query('SELECT 1')
          res.status(200).json({ status: 'ok', database: 'connected' })
        } finally {
          client.release()
        }
      } catch (err) {
        res.status(503).json({ status: 'error', database: 'disconnected' })
      }
    })

    // Create HTTP server
    const server = http.createServer(app)

    // Start listening
    server.listen(PORT, () => {
      console.log(`\n✅ API server running on http://localhost:${PORT}`)
      console.log(`📡 Frontend: http://localhost:5173\n`)
    })

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n⏹️  Shutting down server...')
      server.close(async () => {
        await closeDb()
        jobQueue.close()
        process.exit(0)
      })
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Server startup failed:', message)
    console.error(error)
    process.exit(1)
  }
}

main()
