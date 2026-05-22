import { Express } from 'express'
import { Pool } from 'pg'
import { createApp } from '../../app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { DEFAULT_APP_CONFIG } from '../../config'

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
 */
export function createTestApp(pool: Pool): TestAppDeps {
  const tokenStore = new InMemoryTokenStore()
  const jwtConfig = {
    secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
    expiresInSeconds: 3600,
  }

  const app = createApp({
    db: pool,
    jwtConfig,
    tokenStore,
    config: DEFAULT_APP_CONFIG,
  })

  return { app, tokenStore, jwtConfig }
}
