import { Worker, WorkerOptions } from 'bullmq'

export interface WorkerConfig {
  /** BullMQ queue name to consume */
  queueName: string
  /** Redis URL, e.g. "redis://localhost:6379" */
  redisUrl: string
  /** Queue key prefix — must match the BullMQJobQueue prefix. Default: "{bull}" */
  prefix?: string
  /** Job processor function */
  processor: (job: { name: string; data: any; id: string; attemptsMade: number }) => Promise<void>
}

/**
 * Create a BullMQ Worker that consumes one queue.
 * The caller is responsible for calling worker.close() on shutdown.
 */
export function createWorker(config: WorkerConfig): Worker {
  const { queueName, redisUrl, prefix = '{bull}', processor } = config

  const workerOptions: WorkerOptions = {
    connection: { url: redisUrl } as any,
    prefix,
    concurrency: 1,
  }

  const worker = new Worker(
    queueName,
    async (job) => {
      await processor({
        name: job.name,
        data: job.data,
        id: job.id ?? '',
        attemptsMade: job.attemptsMade,
      })
    },
    workerOptions
  )

  worker.on('failed', (job, err) => {
    // Log failures without crashing; BullMQ handles retries automatically
    console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err.message)
  })

  return worker
}
