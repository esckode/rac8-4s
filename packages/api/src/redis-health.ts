/**
 * V1.5 — Shared Redis health state.
 *
 * Tracks whether Redis is currently reachable, so the 503 middleware can
 * make a fast decision without doing a synchronous ping on every request
 * (which would hang under enableOfflineQueue or add latency).
 *
 * The state is updated by the /health/ready endpoint (or any explicit probe).
 * Because the ALB calls /health/ready on a schedule (e.g. every 30 s), the
 * cached state is refreshed regularly without per-request overhead.
 */

import type { RedisConfig } from './config'
import type { Redis } from 'ioredis'

export type RedisHealthStatus = 'up' | 'down' | 'disabled'

/**
 * Returns true when at least one Redis-backed component is selected in the given config.
 * When true, Redis is a required dependency and an outage trips the 503 guard.
 */
export function isRedisSelected(config: RedisConfig): boolean {
  return (
    config.sseBus === 'redis' ||
    config.jobQueue === 'bullmq' ||
    config.tokenStore === 'redis'
  )
}

/**
 * Probe the Redis client with a PING. Returns the health status synchronously-safe
 * (callers await this async function).
 *
 * Uses a short timeout so the readiness probe fails fast when Redis is unreachable,
 * regardless of the client's enableOfflineQueue setting.
 */
export async function probeRedisHealth(
  client: Redis | null | undefined,
  redisSelected: boolean
): Promise<RedisHealthStatus> {
  if (!client || !redisSelected) return 'disabled'

  try {
    // Race the ping against a short timeout so we don't block readiness long
    await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis ping timeout')), 2000)
      ),
    ])
    return 'up'
  } catch {
    return 'down'
  }
}

/**
 * Mutable shared health state. Updated by /health/ready; read by the 503 middleware.
 * One instance per app (passed via AppDependencies). Not a singleton — tests create
 * their own instances so they don't bleed state across test cases.
 */
export class RedisHealthState {
  private status: RedisHealthStatus = 'disabled'

  set(s: RedisHealthStatus): void {
    this.status = s
  }

  get(): RedisHealthStatus {
    return this.status
  }

  isDown(): boolean {
    return this.status === 'down'
  }
}
