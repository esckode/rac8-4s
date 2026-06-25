import http from 'node:http'
import path from 'node:path'
import dotenv from 'dotenv'

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { createApp } from './app'
import { initializeDb, closeDb } from './db-connections'
import { runMigrations } from './migrations'
import { InMemoryTokenStore } from './auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { selectBroadcastBus } from './broadcast-bus'
import { getAppConfig } from './config'
import { createRedisClient } from './redis'
import { createEmailService } from './services/email-service'
import { ServiceEmailAdapter } from './email-service-adapter'
import { getLogger } from './logger'
import { seedTestAccounts } from '../scripts/seed-test-accounts'

const log = getLogger('server')

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001

async function main() {
  try {
    console.log(`🚀 Starting API server on port ${PORT}...`)

    // Initialize database pool
    const pool = await initializeDb()

    // Run migrations
    const migrationsDir = path.resolve(__dirname, '../../../db/migrations')
    await runMigrations(pool, migrationsDir)

    // Seed test accounts in development mode
    if (process.env.NODE_ENV === 'development') {
      await seedTestAccounts(pool)
    }

    // Load configuration with environment overrides
    const config = getAppConfig()

    // Initialize Redis client (null = in-memory mode)
    const redisClient = createRedisClient(config.redis)

    // Initialize dependencies
    const tokenStore = new InMemoryTokenStore()
    const jobQueue = new InMemoryJobQueue()
    const broadcastBus = selectBroadcastBus()

    // Initialize email service based on configuration
    let emailAdapter
    try {
      const emailService = createEmailService(config.email.service, {
        fromAddress: config.email.fromAddress,
        sendgridApiKey: process.env.SENDGRID_API_KEY || undefined,
        awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
        awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
        awsRegion: process.env.AWS_REGION || undefined,
      })
      emailAdapter = new ServiceEmailAdapter(emailService, config.email.fromAddress)
      log.info('email.service.initialized', { service: config.email.service })
    } catch (error) {
      log.warn('email.service.initialization_failed', {
        service: config.email.service,
        error: error instanceof Error ? error.message : String(error),
        fallback: 'none',
      })
      // For now, don't provide an email adapter if service fails
      // In production, consider fallback or different initialization strategy
    }

    // Create Express app (health route is inside createApp)
    const app = createApp({
      config,
      db: pool,
      jwtConfig: { secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production', expiresInSeconds: 3600 },
      tokenStore,
      jobQueue,
      broadcastBus,
      emailAdapter,
      redis: redisClient,
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
        if (redisClient) await redisClient.quit().catch(() => {})
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
