import { EventEmitter } from 'node:events'
import Redis from 'ioredis'
import { getLogger } from './logger'

const log = getLogger('broadcast-bus')

/** Contract for the SSE broadcast bus. Emit events keyed on conversation_id; subscribe to receive them. */
export interface IBroadcastBus {
  emit(conversationId: string, event: string, data: unknown): void
  subscribe(conversationId: string, listener: (event: string, data: unknown) => void): () => void
}

// ─── In-process bus ───────────────────────────────────────────────────────────

export class BroadcastBus implements IBroadcastBus {
  private emitter = new EventEmitter()

  constructor() {
    // Intentionally support many concurrent SSE subscribers; suppress Node's default warning
    this.emitter.setMaxListeners(0)
  }

  emit(conversationId: string, event: string, data: unknown): void {
    this.emitter.emit(conversationId, event, data)
  }

  subscribe(conversationId: string, listener: (event: string, data: unknown) => void): () => void {
    this.emitter.on(conversationId, listener)
    return () => this.emitter.off(conversationId, listener)
  }

  listenerCount(conversationId: string): number {
    return this.emitter.listenerCount(conversationId)
  }
}

// ─── Redis pub/sub bus ────────────────────────────────────────────────────────

/**
 * RedisBroadcastBus — pure Redis pub/sub SSE relay (R-17.3).
 *
 * Every emit goes through Redis pub/sub — there is NO in-process fast-path.
 * Local delivery happens via the same SUBSCRIBE callback as cross-node delivery.
 * This is intentional (R-17.3.2): a single uniform path, no origin dedup.
 * Ephemeral (fire-and-forget) — Postgres remains the durable record (R-17.3.3).
 *
 * Uses a separate ioredis connection for pub and sub (ioredis requirement).
 */
const CHANNEL = 'sse-broadcast'

// Fail fast instead of hanging when Redis is unreachable.
const FAILFAST = { maxRetriesPerRequest: 1, retryStrategy: () => null } as const

type Listener = (event: string, data: unknown) => void

export class RedisBroadcastBus implements IBroadcastBus {
  private pub: Redis
  private sub: Redis
  private listeners = new Map<string, Set<Listener>>()
  private ready: Promise<void>
  private _healthy = false

  constructor(redisUrl: string) {
    this.pub = new Redis(redisUrl, FAILFAST)
    this.sub = new Redis(redisUrl, FAILFAST)

    this.pub.on('error', (err) => {
      this._healthy = false
      log.warn('redis.bus.pub.error', { message: err.message })
    })
    this.sub.on('error', (err) => {
      this._healthy = false
      log.warn('redis.bus.sub.error', { message: err.message })
    })
    this.pub.on('connect', () => {
      this._healthy = true
    })
    this.sub.on('connect', () => {
      this._healthy = true
    })

    this.sub.on('message', (_channel: string, payload: string) => {
      try {
        const { conversationId, event, data } = JSON.parse(payload)
        const set = this.listeners.get(conversationId)
        if (set) for (const l of set) l(event, data)
      } catch {
        /* ignore malformed payloads */
      }
    })

    this.ready = this.sub.subscribe(CHANNEL).then(() => {
      this._healthy = true
    }).catch(() => {
      // Subscription may fail if close() is called before the handshake completes
    })
  }

  /** Pure pub/sub: publish only. Local delivery happens via the SUBSCRIBE callback. */
  emit(conversationId: string, event: string, data: unknown): void {
    void this.pub.publish(CHANNEL, JSON.stringify({ conversationId, event, data }))
  }

  subscribe(conversationId: string, listener: Listener): () => void {
    let set = this.listeners.get(conversationId)
    if (!set) {
      set = new Set()
      this.listeners.set(conversationId, set)
    }
    set.add(listener)
    return () => {
      const s = this.listeners.get(conversationId)
      if (s) {
        s.delete(listener)
        if (s.size === 0) this.listeners.delete(conversationId)
      }
    }
  }

  /** Resolves once the SUBSCRIBE handshake is complete. */
  whenReady(): Promise<void> {
    return this.ready
  }

  /** Health probe used by /health endpoint: 'connected' | 'down' */
  async busHealthStatus(): Promise<'connected' | 'down'> {
    try {
      await this.pub.ping()
      return 'connected'
    } catch {
      return 'down'
    }
  }

  async close(): Promise<void> {
    // Use disconnect() (force-close) rather than quit() so that closing
    // a connection that hasn't finished connecting doesn't throw.
    this.pub.disconnect()
    this.sub.disconnect()
  }
}

// ─── Factory (env-selection) ──────────────────────────────────────────────────

/**
 * Select the SSE bus based on env vars.
 * SSE_BUS=redis + REDIS_URL → RedisBroadcastBus
 * Otherwise → BroadcastBus (in-process, no Redis required)
 */
export function selectBroadcastBus(): IBroadcastBus {
  if (process.env.SSE_BUS === 'redis' && process.env.REDIS_URL) {
    log.info('bus.selected', { backend: 'redis', url: process.env.REDIS_URL })
    return new RedisBroadcastBus(process.env.REDIS_URL)
  }
  if (process.env.SSE_BUS === 'redis' && !process.env.REDIS_URL) {
    log.warn('bus.fallback', {
      reason: 'SSE_BUS=redis but REDIS_URL not set; falling back to in-process bus',
    })
  }
  return new BroadcastBus()
}
