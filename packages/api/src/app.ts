import express, { Express, Request, Response, NextFunction } from 'express'
import Database from 'better-sqlite3'
import { JwtConfig, TokenStore } from './auth'
import { AuthError, ForbiddenError, MissingTokenError } from './auth/errors'
import tournamentsRouter from './routes/tournaments'
import playerRouter from './routes/player'

export interface AppDependencies {
  db: Database.Database
  jwtConfig: JwtConfig
  tokenStore: TokenStore
}

export function createApp(deps: AppDependencies): Express {
  const app = express()

  app.use(express.json())

  app.use('/tournaments', tournamentsRouter(deps))
  app.use('/player', playerRouter(deps))

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ForbiddenError) {
      return res.status(403).json({ code: err.code, message: err.message })
    }
    if (err instanceof MissingTokenError || err instanceof AuthError) {
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

    console.error('Unhandled error:', err)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' })
  })

  return app
}
