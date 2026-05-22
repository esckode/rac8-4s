import { Express } from 'express'
import { Pool } from 'pg'
import { createApp } from '../../app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { DEFAULT_APP_CONFIG } from '../../config'
import { getTransactionClient } from './db'

export interface JwtConfig {
  secret: string
  expiresInSeconds: number
}

export interface TestAppDeps {
  app: Express
  tokenStore: InMemoryTokenStore
  jwtConfig: JwtConfig
}

/**
 * Create a test app with real database and in-memory auth store.
 * If a transaction is active, uses the transaction client for all queries.
 * Otherwise uses the pool.
 */
export function createTestApp(pool: Pool): TestAppDeps {
  const tokenStore = new InMemoryTokenStore()
  const jwtConfig = {
    secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
    expiresInSeconds: 3600,
  }

  // Use transaction client if active, otherwise use pool
  const connection = getTransactionClient() || pool

  const app = createApp({
    db: connection,
    jwtConfig,
    tokenStore,
    config: DEFAULT_APP_CONFIG,
  })

  return { app, tokenStore, jwtConfig }
}
