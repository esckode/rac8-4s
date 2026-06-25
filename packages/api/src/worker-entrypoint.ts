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
import { PartitionManager } from './services/partition-manager'
import { ServiceEmailAdapter } from './email-service-adapter'
import { createEmailService } from './services/email-service'
import { DEFAULT_APP_CONFIG } from './config'
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

  // ── Email adapter for the notify worker ────────────────────────────────────
  let emailAdapter: ServiceEmailAdapter | undefined
  try {
    const emailService = createEmailService(DEFAULT_APP_CONFIG.email.service, {
      fromAddress: DEFAULT_APP_CONFIG.email.fromAddress,
      sendgridApiKey: process.env.SENDGRID_API_KEY || undefined,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
      awsRegion: process.env.AWS_REGION || undefined,
    })
    emailAdapter = new ServiceEmailAdapter(emailService, DEFAULT_APP_CONFIG.email.fromAddress)
    log.info('email.service.initialized', { service: DEFAULT_APP_CONFIG.email.service })
  } catch (err) {
    log.warn('email.service.initialization_failed', {
      message: err instanceof Error ? err.message : String(err),
    })
  }

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
  ]

  log.info('worker.started', { queues: workers.map((_, i) => i) })

  const shutdown = async () => {
    log.info('worker.shutting_down', {})
    await Promise.all(workers.map((w) => w.close()))
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
