import express, { Express, Request, Response, NextFunction } from 'express'
import { Pool, PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { JwtConfig, TokenStore } from './auth'
import { AuthError, ForbiddenError, MissingTokenError, TokenExpiredError } from './auth/errors'
import {
  DatabaseError,
  ConstraintViolationError,
  ConnectionError,
  TimeoutError,
  DeadlockError,
} from './db/errors'
import { getLogger, runWithRequestId } from './logger'
import tournamentsRouter from './routes/tournaments'
import messagesRouter from './routes/messages'
import playerRouter from './routes/player'
import analyticsRouter from './routes/analytics'
import authRouter from './routes/auth'
import type { JobQueue } from '@worker/job-queue'
import type { StandingsCache } from './standings-cache'
import type { BroadcastBus } from './broadcast-bus'
import type { AppConfig } from './config'
import type { EmailAdapter } from './email-adapter'
import { QueueMonitor } from './queue-monitor'

const httpLog = getLogger('http')

function parsePostgresError(err: Error): Error {
  const msg = err.message || ''

  // Connection/network errors
  if (msg.includes('ECONNREFUSED') || msg.includes('connect ECONNREFUSED')) {
    return new ConnectionError('Unable to connect to database')
  }
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout expired')) {
    return new TimeoutError('Database query timeout')
  }

  // Deadlock error (PostgreSQL error code 40P01)
  if (msg.includes('40P01') || msg.includes('deadlock detected')) {
    return new DeadlockError()
  }

  // Constraint violations
  if (msg.includes('duplicate key value violates unique constraint')) {
    // Try to extract field name
    const match = msg.match(/Key \("([^"]+)"\)/)
    const field = match ? match[1] : undefined
    return new ConstraintViolationError(
      field ? `${field} already exists` : 'Value already exists',
      field === 'email' ? 'DUPLICATE_EMAIL' : 'DUPLICATE_VALUE'
    )
  }

  if (msg.includes('violates foreign key constraint')) {
    return new ConstraintViolationError(
      'Referenced record does not exist',
      'INVALID_REFERENCE'
    )
  }

  if (msg.includes('violates check constraint')) {
    const match = msg.match(/violates check constraint "([^"]+)"/)
    const field = match ? match[1] : undefined
    return new ConstraintViolationError(
      field ? `Invalid value for ${field}` : 'Invalid constraint value',
      'INVALID_VALUE'
    )
  }

  if (msg.includes('null value in column') || msg.includes('NOT NULL constraint failed')) {
    const match = msg.match(/column "([^"]+)"/)
    const field = match ? match[1] : undefined
    return new ConstraintViolationError(
      field ? `${field} is required` : 'Required field is missing',
      'REQUIRED_FIELD'
    )
  }

  return err
}

export interface AppDependencies {
  db: Pool | PoolClient
  jwtConfig: JwtConfig
  tokenStore: TokenStore
  config: AppConfig
  emailAdapter?: EmailAdapter
  jobQueue?: JobQueue
  standingsCache?: StandingsCache
  broadcastBus?: BroadcastBus
  locationRepository?: any
  courtRepository?: any
}

export function createApp(deps: AppDependencies): Express {
  const app = express()

  // Wrap queue with monitor for anomaly detection
  const monitoredQueue = deps.jobQueue ? new QueueMonitor(deps.jobQueue, deps.config) : undefined
  const appDeps = { ...deps, jobQueue: monitoredQueue }

  app.use(express.json())

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID()
    res.setHeader('X-Request-ID', requestId)
    const start = Date.now()
    res.on('finish', () => {
      const ctx = { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }
      if (res.statusCode >= 500) httpLog.error('request', ctx)
      else if (res.statusCode >= 400) httpLog.warn('request', ctx)
      else httpLog.debug('request', ctx)
    })
    runWithRequestId(requestId, next)
  })

  app.use('/tournaments', tournamentsRouter(appDeps))
  // Messaging routes: /:id/announcements, /:id/messages, /:id/messages/:msgId/read.
  // Mounted after tournamentsRouter; paths are disjoint so no shadowing occurs.
  // Static literal paths (announcements) are registered before parameterized (:msgId)
  // inside the router itself (see routes/messages.ts §10).
  app.use('/tournaments', messagesRouter(appDeps))
  app.use('/player', playerRouter(appDeps))
  app.use('/api/analytics', analyticsRouter(appDeps))
  app.use('/api/auth', authRouter(appDeps))

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Parse PostgreSQL errors first
    if (err instanceof Error && !('statusCode' in err)) {
      err = parsePostgresError(err)
    }

    // Auth errors
    if (err instanceof ForbiddenError) {
      httpLog.warn('forbidden', { code: err.code })
      return res.status(403).json({ code: err.code, message: err.message })
    }
    if (err instanceof TokenExpiredError) {
      httpLog.warn('unauthorized', { code: 'TOKEN_INVALID', message: err.message })
      return res.status(401).json({ code: 'TOKEN_INVALID', message: err.message })
    }
    if (err instanceof MissingTokenError || err instanceof AuthError) {
      httpLog.warn('unauthorized', { code: err.code, message: err.message })
      return res.status(401).json({ code: err.code, message: err.message })
    }

    // Database errors
    if (err instanceof DatabaseError) {
      const logLevel = err.statusCode >= 500 ? 'error' : 'warn'
      httpLog[logLevel as 'error' | 'warn']('database', { code: err.code, statusCode: err.statusCode })
      return res.status(err.statusCode).json({ code: err.code, message: err.message })
    }

    // Validation errors
    if (err instanceof Error && err.message.includes('validation')) {
      httpLog.warn('validation', { message: err.message })
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message })
    }

    httpLog.error('unhandled', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  return app
}
