import http from 'node:http'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { createApp } from './app'
import { openDatabase } from './db'
import { InMemoryTokenStore } from './auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { BroadcastBus } from './broadcast-bus'
import { DEFAULT_APP_CONFIG } from './config'

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
const DB_PATH = path.resolve(process.env.DATABASE_PATH || 'db/tournament.db')

async function main() {
  try {
    console.log(`🚀 Starting API server on port ${PORT}...`)

    // Ensure db directory exists
    const dbDir = path.dirname(DB_PATH)
    mkdirSync(dbDir, { recursive: true })

    // Initialize database
    const db = openDatabase(DB_PATH)

    // Initialize dependencies
    const tokenStore = new InMemoryTokenStore()
    const jobQueue = new InMemoryJobQueue()
    const broadcastBus = new BroadcastBus()

    // Create Express app
    const app = createApp({
      config: DEFAULT_APP_CONFIG,
      db,
      jwtConfig: { secret: 'dev-secret-key-change-in-production', expiresInSeconds: 3600 },
      tokenStore,
      jobQueue,
      broadcastBus,
    })

    // Create HTTP server
    const server = http.createServer(app)

    // Start listening
    server.listen(PORT, () => {
      console.log(`\n✅ API server running on http://localhost:${PORT}`)
      console.log(`📝 Database: ${DB_PATH}`)
      console.log(`📡 Frontend: http://localhost:5173\n`)
    })

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n⏹️  Shutting down server...')
      server.close(() => {
        jobQueue.close()
        process.exit(0)
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Server startup failed:', message)
    console.error(error)
    process.exit(1)
  }
}

main()
