import Redis from 'ioredis'
import type { RedisConfig } from './config'
import { getLogger } from './logger'

const log = getLogger('redis')

export interface RedisClientOptions {
  url: string | undefined
  jobQueue: RedisConfig['jobQueue']
  sseBus: RedisConfig['sseBus']
  /** Connection timeout in ms. Default: 2000 */
  connectTimeoutMs?: number
  /** Max retries per request before failing. Default: 0 (fail fast) */
  maxRetriesPerRequest?: number
}

/**
 * Create a shared ioredis client from config.
 *
 * Returns null when both backends are in-memory (no Redis URL needed).
 * When a URL is provided, creates a client with fail-fast options so the
 * caller discovers connectivity failures quickly rather than hanging.
 *
 * Callers should listen for the 'error' event to handle connection failures
 * without crashing the process. The /health endpoint uses ping() to report
 * redis status.
 */
export function createRedisClient(opts: RedisClientOptions): Redis | null {
  const redisNeeded = opts.sseBus === 'redis' || opts.jobQueue === 'bullmq'

  if (!opts.url && !redisNeeded) {
    return null
  }

  if (!opts.url) {
    log.warn('redis.url.missing', {
      jobQueue: opts.jobQueue,
      sseBus: opts.sseBus,
      note: 'Redis-backed backend selected but REDIS_URL not set; connection will fail',
    })
  }

  const connectTimeout = opts.connectTimeoutMs ?? 2000
  const maxRetriesPerRequest = opts.maxRetriesPerRequest ?? 0

  const client = new Redis(opts.url ?? 'redis://localhost:6379', {
    // Fail fast: don't spend long trying to connect
    connectTimeout,
    // Do not retry individual commands — let the caller decide
    maxRetriesPerRequest,
    // Do not attempt reconnects in test paths; real server.ts will handle reconnect
    lazyConnect: false,
    // Silence the unhandled-error crash — callers attach their own error listener
    enableOfflineQueue: false,
  })

  client.on('error', (err) => {
    log.warn('redis.connection.error', { message: err.message })
  })

  client.on('connect', () => {
    log.info('redis.connected', {})
  })

  client.on('close', () => {
    log.warn('redis.connection.closed', {})
  })

  return client
}
