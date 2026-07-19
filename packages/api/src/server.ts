import http from 'node:http'
import path from 'node:path'
import dotenv from 'dotenv'

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { createApp } from './app'
import { initializeDb, closeDb } from './db-connections'
import { runMigrations } from './migrations'
import { selectTokenStore } from './auth/token-store'
import { selectBroadcastBus } from './broadcast-bus'
import { selectJobQueue } from './job-queue-factory'
import { getAppConfig } from './config'
import { createRedisClient } from './redis'
import { createEmailService } from './services/email-service'
import { ServiceEmailAdapter } from './email-service-adapter'
import { getLogger } from './logger'
import { seedTestAccounts } from '../scripts/seed-test-accounts'
import { InMemoryStandingsCache, subscribeToStandingsInvalidations } from './standings-cache'
import { GroupMessageRepository } from './repositories/group-message-repository'
import { selectAssistantClient } from './assistant/assistant-client-factory'
import { AssistantRateLimiter, ASSISTANT_HOURLY_LIMITS } from './assistant/rate-limiter'
import { selectRateLimitStore } from './middleware/rate-limit-store'
import { processAssistantReply } from './workers/assistant-processor'
import { processRecapSweep as runRecapSweep } from './workers/recap-processor'
import type { AssistantJobPayload } from './assistant/assistant-service'
import { selectCoachClient } from './assistant/coach-client-factory'
import { PlayerMemoryRepository } from './repositories/player-memory-repository'
import { processCoachTurn, type CoachJobPayload } from './workers/coach-processor'

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
    const tokenStore = selectTokenStore()
    const jobQueue = selectJobQueue()
    const broadcastBus = selectBroadcastBus()

    // Standings cache + bus-driven invalidation (V2.4 / R-17.10.3).
    // Each instance maintains its own InMemoryStandingsCache.  When a score
    // write publishes standings.invalidate on the bus, this subscription drops
    // the named group from the local cache so the next read re-fetches from DB.
    const standingsCache = new InMemoryStandingsCache()
    const unsubscribeStandingsInvalidations = subscribeToStandingsInvalidations(broadcastBus, standingsCache)

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

    // Assistant (@coach): in BullMQ mode the worker tier consumes
    // assistant.reply/coach.turn; the in-memory queue has no consumer, so those two
    // inline processors are memory-mode-only (single-process dev/e2e). The client +
    // rate limiter themselves, and processRecapSweep, are built unconditionally —
    // the worker's own /test/recap-sweep-equivalent (§C sweep) already runs
    // regardless of queue mode, and the test-only /test/recap-sweep HTTP trigger
    // (app.ts) needs the same direct, synchronous escape hatch in BullMQ mode too
    // (it previously 500'd there with "not wired (JOB_QUEUE=bullmq mode?)").
    const assistantDeps = {
      pool,
      groupMessageRepo: new GroupMessageRepository(pool),
      client: selectAssistantClient(config),
      rateLimiter: new AssistantRateLimiter(selectRateLimitStore(), {
        ...ASSISTANT_HOURLY_LIMITS,
        dailyBudgetUsd: config.assistant.dailyBudgetUsd,
      }),
      broadcastBus,
    }
    const processRecapSweep = () =>
      runRecapSweep({
        pool,
        client: assistantDeps.client,
        rateLimiter: assistantDeps.rateLimiter,
        broadcastBus: assistantDeps.broadcastBus,
      })

    let processAssistantJob: ((payload: AssistantJobPayload) => Promise<void>) | undefined
    let processCoachJob: ((payload: CoachJobPayload) => Promise<void>) | undefined
    if (config.redis.jobQueue !== 'bullmq') {
      processAssistantJob = payload => processAssistantReply(payload, assistantDeps)

      // 1:1 Coach shares the assistant rate limiter's budget kill-switch/store (design §7 #2).
      const coachDeps = {
        pool,
        groupMessageRepo: assistantDeps.groupMessageRepo,
        memoryRepo: new PlayerMemoryRepository(pool),
        client: selectCoachClient(config),
        rateLimiter: assistantDeps.rateLimiter,
        broadcastBus,
      }
      processCoachJob = payload => processCoachTurn(payload, coachDeps)
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
      standingsCache,
      processAssistantJob,
      processRecapSweep,
      processCoachJob,
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
      unsubscribeStandingsInvalidations()
      server.close(async () => {
        await closeDb()
        jobQueue.close()
        if ('close' in tokenStore && typeof (tokenStore as any).close === 'function') {
          await (tokenStore as any).close().catch(() => {})
        }
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
