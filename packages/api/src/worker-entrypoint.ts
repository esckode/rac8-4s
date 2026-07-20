/**
 * Worker entrypoint — registers all BullMQ processors and starts consuming.
 *
 * Run with:
 *   npm run dev:worker       (from packages/api)
 *
 * Requires: REDIS_URL, DATABASE_URL (or individual DB env vars)
 * Optional: JOB_QUEUE=bullmq (the worker always uses BullMQ directly)
 */

import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { initializeDb, closeDb } from './db-connections'
import { runMigrations } from './migrations'
import { createWorker } from '@worker/worker'
import { registerPartitionJobs } from '@worker/partition-scheduler'
import { processReadReceiptFlush } from './workers/read-receipt-processor'
import { processPartitionEnsure, processPartitionPurge } from './workers/partition-processor'
import { processMessagingNotify } from './workers/notify-processor'
import { processAssistantReply } from './workers/assistant-processor'
import { processCoachTurn } from './workers/coach-processor'
import { processNudgeSweep } from './workers/nudge-processor'
import { processRecapSweep } from './workers/recap-processor'
import { processDigestSweep } from './workers/digest-processor'
import { registerAssistantSweepJobs } from './assistant/sweep-scheduler'
import { BullMQJobQueue } from '@worker/bullmq-queue'
import { PartitionManager } from './services/partition-manager'
import { ServiceEmailAdapter } from './email-service-adapter'
import { createEmailService } from './services/email-service'
import { getAppConfig } from './config'
import { GroupMessageRepository } from './repositories/group-message-repository'
import { selectAssistantClient } from './assistant/assistant-client-factory'
import { selectCoachClient } from './assistant/coach-client-factory'
import { PlayerMemoryRepository } from './repositories/player-memory-repository'
import { AssistantRateLimiter, ASSISTANT_HOURLY_LIMITS } from './assistant/rate-limiter'
import { selectRateLimitStore } from './middleware/rate-limit-store'
import { selectBroadcastBus } from './broadcast-bus'
import { getLogger } from './logger'

const log = getLogger('worker-entrypoint')

const REDIS_URL = process.env.REDIS_URL

if (!REDIS_URL) {
  log.error('worker.startup.failed', { reason: 'REDIS_URL is required for the BullMQ worker' })
  process.exit(1)
}

async function main() {
  log.info('worker.starting', { redisUrl: REDIS_URL })

  const pool = await initializeDb()
  const migrationsDir = path.resolve(__dirname, '../../../db/migrations')
  await runMigrations(pool, migrationsDir)

  // ── Boot-time partition ensure (current + 3 months ahead) ─────────────────
  // Runs before the workers start, so a fresh deploy always has partitions ready.
  const partitionManager = new PartitionManager(pool)
  try {
    await partitionManager.ensureFuturePartitions(3)
    log.info('partition.boot.ensure.done', {})
  } catch (err) {
    log.error('partition.boot.ensure.failed', {
      message: err instanceof Error ? err.message : String(err),
    })
    // Non-fatal: workers can still start; the monthly repeatable job will retry
  }

  // ── Register monthly repeatable jobs (idempotent — dedup by repeat key) ───
  try {
    await registerPartitionJobs({ redisUrl: REDIS_URL! })
    log.info('partition.scheduler.registered', {})
  } catch (err) {
    log.error('partition.scheduler.registration.failed', {
      message: err instanceof Error ? err.message : String(err),
    })
  }

  // ── Register hourly assistant proactive-sweep jobs (idempotent) ───────────
  try {
    await registerAssistantSweepJobs({ redisUrl: REDIS_URL! })
    log.info('assistant.sweep.scheduler.registered', {})
  } catch (err) {
    log.error('assistant.sweep.scheduler.registration.failed', {
      message: err instanceof Error ? err.message : String(err),
    })
  }

  // getAppConfig() (not DEFAULT_APP_CONFIG) so this respects EMAIL_SERVICE,
  // matching server.ts:53 — otherwise the worker's notify-email path always
  // uses the hardcoded 'mock' default regardless of the deployed config.
  const appConfig = getAppConfig()

  // ── Email adapter for the notify worker ────────────────────────────────────
  let emailAdapter: ServiceEmailAdapter | undefined
  try {
    const emailService = createEmailService(appConfig.email.service, {
      fromAddress: appConfig.email.fromAddress,
      sendgridApiKey: process.env.SENDGRID_API_KEY || undefined,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
      awsRegion: process.env.AWS_REGION || undefined,
    })
    emailAdapter = new ServiceEmailAdapter(emailService, appConfig.email.fromAddress)
    log.info('email.service.initialized', { service: appConfig.email.service })
  } catch (err) {
    log.warn('email.service.initialization_failed', {
      message: err instanceof Error ? err.message : String(err),
    })
  }

  // ── Assistant (@coach) processor deps ──────────────────────────────────────
  // Adapter defaults to mock (no network) until ASSISTANT_ADAPTER is set (A9.2).
  // The bus must be Redis-backed (SSE_BUS=redis) for replies to reach API
  // instances' SSE connections from the worker tier.
  const assistantDeps = {
    pool,
    groupMessageRepo: new GroupMessageRepository(pool),
    client: selectAssistantClient(appConfig),
    rateLimiter: new AssistantRateLimiter(selectRateLimitStore(), {
      ...ASSISTANT_HOURLY_LIMITS,
      dailyBudgetUsd: appConfig.assistant.dailyBudgetUsd,
    }),
    broadcastBus: selectBroadcastBus(),
  }

  // ── 1:1 Coach processor deps — shares the rate limiter's budget kill-switch
  // and store with the group surface (design §7 #2: one kill-switch).
  const coachDeps = {
    pool,
    groupMessageRepo: assistantDeps.groupMessageRepo,
    memoryRepo: new PlayerMemoryRepository(pool),
    client: selectCoachClient(appConfig),
    rateLimiter: assistantDeps.rateLimiter,
    broadcastBus: assistantDeps.broadcastBus,
  }

  // Proactive sweeps enqueue their own downstream jobs (e.g. messaging.notify
  // for nudge recipients) — a dedicated BullMQ-backed queue, not the request-
  // path selectJobQueue() (that one is driven by the API's JOB_QUEUE env var,
  // whereas this worker process always speaks BullMQ directly).
  const assistantJobQueue = new BullMQJobQueue({ url: REDIS_URL! })

  const workers = [
    createWorker({
      queueName: 'messaging.read_receipt.flush',
      redisUrl: REDIS_URL!,
      processor: async (job) => {
        await processReadReceiptFlush(job.data, { pool })
      },
    }),

    createWorker({
      queueName: 'messaging.partition.ensure',
      redisUrl: REDIS_URL!,
      processor: async (job) => {
        await processPartitionEnsure(job.data, { pool })
      },
    }),

    createWorker({
      queueName: 'messaging.partition.purge',
      redisUrl: REDIS_URL!,
      processor: async (job) => {
        await processPartitionPurge(job.data, { pool })
      },
    }),

    ...(emailAdapter
      ? [
          createWorker({
            queueName: 'messaging.notify',
            redisUrl: REDIS_URL!,
            processor: async (job) => {
              await processMessagingNotify(job.data, { pool, emailAdapter: emailAdapter! })
            },
          }),
        ]
      : []),

    createWorker({
      queueName: 'assistant.reply',
      redisUrl: REDIS_URL!,
      processor: async (job) => {
        await processAssistantReply(job.data, assistantDeps)
      },
    }),

    createWorker({
      queueName: 'coach.turn',
      redisUrl: REDIS_URL!,
      processor: async (job) => {
        await processCoachTurn(job.data, coachDeps)
      },
    }),

    createWorker({
      queueName: 'assistant.nudge.sweep',
      redisUrl: REDIS_URL!,
      processor: async () => {
        await processNudgeSweep({
          pool,
          jobQueue: assistantJobQueue,
          broadcastBus: assistantDeps.broadcastBus,
        })
      },
    }),

    createWorker({
      queueName: 'assistant.recap.sweep',
      redisUrl: REDIS_URL!,
      processor: async () => {
        await processRecapSweep({
          pool,
          client: assistantDeps.client,
          rateLimiter: assistantDeps.rateLimiter,
          broadcastBus: assistantDeps.broadcastBus,
        })
      },
    }),

    createWorker({
      queueName: 'assistant.digest',
      redisUrl: REDIS_URL!,
      processor: async () => {
        await processDigestSweep({ pool, broadcastBus: assistantDeps.broadcastBus })
      },
    }),
  ]

  log.info('worker.started', { queues: workers.map((_, i) => i) })

  const shutdown = async () => {
    log.info('worker.shutting_down', {})
    await Promise.all(workers.map((w) => w.close()))
    await assistantJobQueue.close()
    await closeDb()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  log.error('worker.startup.failed', { message: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
