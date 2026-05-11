import express, { Express, Request, Response, NextFunction } from 'express'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { JwtConfig, TokenStore } from './auth'
import { AuthError, ForbiddenError, MissingTokenError } from './auth/errors'
import { getLogger, runWithRequestId } from './logger'
import tournamentsRouter from './routes/tournaments'
import playerRouter from './routes/player'
import type { JobQueue } from '@worker/job-queue'

const httpLog = getLogger('http')

export interface AppDependencies {
  db: Database.Database
  jwtConfig: JwtConfig
  tokenStore: TokenStore
  jobQueue?: JobQueue
  locationRepository?: any
  courtRepository?: any
}

export function createApp(deps: AppDependencies): Express {
  const app = express()

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

  app.use('/tournaments', tournamentsRouter(deps))
  app.use('/player', playerRouter(deps))

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ForbiddenError) {
      httpLog.warn('forbidden', { code: err.code })
      return res.status(403).json({ code: err.code, message: err.message })
    }
    if (err instanceof MissingTokenError || err instanceof AuthError) {
      httpLog.warn('unauthorized', { message: err.message })
      return res.status(401).json({ code: 'UNAUTHORIZED', message: err.message })
    }

    if (err instanceof Error && err.message.includes('validation')) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message })
    }

    if (err instanceof Error) {
      if (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate')) {
        return res.status(400).json({ code: 'DUPLICATE_NAME', message: 'Tournament name already exists' })
      }
    }

    httpLog.error('unhandled', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  return app
}
