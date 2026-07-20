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
import playerGroupsRouter from './routes/player-groups'
import coachRouter from './routes/coach'
import analyticsRouter from './routes/analytics'
import authRouter from './routes/auth'
import { adminRouter } from './routes/admin'
import type { JobQueue } from '@worker/job-queue'
import type { StandingsCache } from './standings-cache'
import type { IBroadcastBus } from './broadcast-bus'
import type { AppConfig } from './config'
import type { EmailAdapter } from './email-adapter'
import { QueueMonitor } from './queue-monitor'
import { processNudgeSweep } from './workers/nudge-processor'
import { processDigestSweep } from './workers/digest-processor'
import { generatePlayerSession } from './auth/magic-link'
import { PlayerRepository, TournamentRepository, GroupRepository as TournamentGroupRepository } from './db'
import type { Redis } from 'ioredis'
import { RedisHealthState, probeRedisHealth, isRedisSelected } from './redis-health'
import type { PartitionManager } from './services/partition-manager'

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
  broadcastBus?: IBroadcastBus
  locationRepository?: any
  courtRepository?: any
  /** Shared ioredis client. null = in-memory mode (no Redis). */
  redis?: Redis | null
  /**
   * Shared Redis health state. Created externally (or auto-created by createApp) so
   * the 503 middleware and /health/ready share the same cached status.
   * Optional: createApp creates one if not provided.
   */
  redisHealthState?: RedisHealthState
  /**
   * PartitionManager instance. When provided, /health and /health/ready include a
   * partition_coverage field ('ok' | 'low' | 'critical' | 'disabled').
   * Optional: if absent, field is omitted or set to 'disabled'.
   */
  partitionManager?: PartitionManager
  /**
   * In-memory-queue consumer for assistant.reply jobs (the InMemoryJobQueue has
   * no consumer — mirrors the inline processStandingsRecalculate pattern).
   * Wired by server.ts only when JOB_QUEUE=memory; in BullMQ mode the worker
   * tier consumes the queue and this stays undefined.
   */
  processAssistantJob?: (payload: {
    messageId: string
    conversationId: string
    groupId: string
    playerId: string
    body: string
  }) => Promise<void>
  /**
   * In-memory-queue trigger for the Phase C recap sweep, wired the same way
   * as processAssistantJob (needs an AssistantClient + rate limiter, neither
   * of which otherwise lives on AppDependencies). Only used by the
   * NODE_ENV!=production /test/recap-sweep e2e trigger.
   */
  processRecapSweep?: () => Promise<void>
  /**
   * In-memory-queue consumer for coach.turn jobs — same rationale as
   * processAssistantJob (S5.4). Wired by server.ts only when JOB_QUEUE=memory.
   */
  processCoachJob?: (payload: {
    messageId: string
    conversationId: string
    playerId: string
    body: string
    timezone?: string
  }) => Promise<void>
}

export function createApp(deps: AppDependencies): Express {
  const app = express()

  // Trust exactly the two verified proxy hops (CloudFront -> ALB -> Node), not
  // blanket `true` — that would also trust an attacker-supplied X-Forwarded-For
  // on any hop count.
  app.set('trust proxy', 2)

  // Wrap queue with monitor for anomaly detection
  const monitoredQueue = deps.jobQueue ? new QueueMonitor(deps.jobQueue, deps.config) : undefined
  const appDeps = { ...deps, jobQueue: monitoredQueue }

  // Shared Redis health state — shared between /health/ready and the 503 middleware
  const healthState = deps.redisHealthState ?? new RedisHealthState()

  const redisClient = deps.redis ?? null
  const redisIsRequired = isRedisSelected(deps.config.redis)

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

  // ─── 503 guard — Redis-down maintenance mode ───────────────────────────────
  // Only engages when a Redis backend is selected AND the cached health state
  // says Redis is down. Health endpoints are exempt (ALB needs them to probe).
  // The guard reads cached state (updated by /health/ready) so it never blocks
  // on a synchronous Redis ping per request.
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Health endpoints must always pass through (ALB probes + admin visibility)
    if (req.path.startsWith('/health')) return next()

    if (redisIsRequired && healthState.isDown()) {
      httpLog.warn('service.unavailable', { path: req.path, reason: 'redis-down' })
      res.setHeader('Retry-After', '30')
      return res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please try again shortly.',
      })
    }
    next()
  })

  app.use('/tournaments', tournamentsRouter(appDeps))
  // Messaging routes: /:id/announcements, /:id/messages, /:id/messages/:msgId/read.
  // Mounted after tournamentsRouter; paths are disjoint so no shadowing occurs.
  // Static literal paths (announcements) are registered before parameterized (:msgId)
  // inside the router itself (see routes/messages.ts §10).
  app.use('/tournaments', messagesRouter(appDeps))
  app.use('/player', playerRouter(appDeps))
  app.use('/player/groups', playerGroupsRouter(appDeps))
  // Rides the existing /player mount — no new top-level path, no CloudFront change (CLAUDE.md §9).
  app.use('/player/coach', coachRouter(appDeps))
  app.use('/api/analytics', analyticsRouter(appDeps))
  app.use('/api/auth', authRouter(appDeps))

  // Test-only endpoint — creates/finds a player and returns an opaque player session token.
  // Disabled in production to prevent auth bypass.
  if (process.env.NODE_ENV !== 'production') {
    app.post('/test/player-token', async (req: Request, res: Response) => {
      try {
        const { email, name, tournamentId } = req.body as { email: string; name: string; tournamentId?: string }
        if (!email || !name) return res.status(400).json({ error: 'email and name required' })
        const playerRepo = new PlayerRepository(appDeps.db as any)
        const player = await playerRepo.findOrCreatePlayerByEmail(
          email.toLowerCase(),
          name,
          undefined,
          undefined,
          { dateOfBirth: '2000-01-01', policyVersion: 'v1' }
        )
        const session = await generatePlayerSession(
          { playerId: player.id, tournamentId: tournamentId ?? 'test', email: player.email, createdAt: Date.now() },
          3600,
          appDeps.tokenStore
        )
        return res.json({ playerToken: session.token, playerId: player.id })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })

    // Test-only endpoint — seeds a group-linked casual round-robin session
    // with an explicit roster (rather than driving the full poll→launch UI
    // flow, which is unrelated to the assistant feature under test).
    // Disabled in production to prevent auth bypass.
    app.post('/test/casual-session', async (req: Request, res: Response) => {
      try {
        const { groupId, playerIds, matchFormat } = req.body as {
          groupId: string
          playerIds: string[]
          matchFormat?: 'singles' | 'doubles'
        }
        if (!groupId || !Array.isArray(playerIds) || playerIds.length < 2) {
          return res.status(400).json({ error: 'groupId and at least 2 playerIds are required' })
        }
        const tournamentRepo = new TournamentRepository(appDeps.db as any)
        const playerRepo = new PlayerRepository(appDeps.db as any)
        const groupRepo = new TournamentGroupRepository(appDeps.db as any)

        const tournament = await tournamentRepo.create({
          name: `Test Casual Session ${Date.now()}`,
          sport: 'tennis',
          matchFormat: matchFormat ?? 'singles',
          maxPlayers: playerIds.length,
          creatorId: playerIds[0],
          mode: 'casual',
          visibility: 'unlisted',
          groupId,
        })
        for (const playerId of playerIds) {
          await playerRepo.createRegistration(playerId, tournament.id)
        }
        await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
        await groupRepo.createGroups(tournament.id, 1, 1, playerIds)
        await tournamentRepo.updateStatus(tournament.id, 'group_stage_active')

        return res.json({ tournamentId: tournament.id })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })

    // Test-only endpoint — seeds a group-linked SCHEDULED round-robin session
    // with an explicit roster and deadline (the /test/casual-session sibling
    // for Phase C nudge/recap e2e, which need a real group_stage_deadline —
    // casual sessions are deadline-exempt so that fixture can't be reused).
    // Disabled in production to prevent auth bypass.
    app.post('/test/scheduled-session', async (req: Request, res: Response) => {
      try {
        const { groupId, playerIds, matchFormat, hoursUntilDeadline } = req.body as {
          groupId: string
          playerIds: string[]
          matchFormat?: 'singles' | 'doubles'
          hoursUntilDeadline: number
        }
        if (!groupId || !Array.isArray(playerIds) || playerIds.length < 2 || typeof hoursUntilDeadline !== 'number') {
          return res.status(400).json({
            error: 'groupId, at least 2 playerIds, and hoursUntilDeadline are required',
          })
        }
        const tournamentRepo = new TournamentRepository(appDeps.db as any)
        const playerRepo = new PlayerRepository(appDeps.db as any)
        const groupRepo = new TournamentGroupRepository(appDeps.db as any)

        const tournament = await tournamentRepo.create({
          name: `Test Scheduled Session ${Date.now()}`,
          sport: 'tennis',
          matchFormat: matchFormat ?? 'singles',
          maxPlayers: playerIds.length,
          creatorId: playerIds[0],
          mode: 'scheduled',
          visibility: 'unlisted',
          groupId,
          groupStageDeadline: new Date(Date.now() + hoursUntilDeadline * 3_600_000).toISOString(),
        })
        for (const playerId of playerIds) {
          await playerRepo.createRegistration(playerId, tournament.id)
        }
        await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
        await groupRepo.createGroups(tournament.id, 1, 1, playerIds)

        return res.json({ tournamentId: tournament.id })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })

    // Test-only endpoint — runs the Phase C nudge sweep synchronously so e2e
    // can drive it without waiting on a real hourly BullMQ cron tick.
    // Disabled in production to prevent auth bypass.
    app.post('/test/nudge-sweep', async (_req: Request, res: Response) => {
      try {
        await processNudgeSweep({
          pool: appDeps.db as any,
          jobQueue: appDeps.jobQueue,
          broadcastBus: appDeps.broadcastBus,
        })
        return res.json({ ok: true })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })

    // Test-only endpoint — scores all remaining matches and marks a
    // tournament terminal, so e2e can reach 'tournament_complete' for the
    // recap sweep. Grounding note (verified 2026-07-13): NO production route
    // actually drives a SCHEDULED tournament to 'tournament_complete' —
    // casual's /:id/end-session only reaches 'completed'/'abandoned' and is
    // casual-only; 'tournament_complete' is a reachable repo.updateStatus
    // value with no caller (flagged in BACKLOG.md, same pattern as the
    // pre-existing processAutoCloseSweep-has-no-caller gap).
    // Disabled in production to prevent auth bypass.
    app.post('/test/complete-tournament', async (req: Request, res: Response) => {
      try {
        const { tournamentId, status } = req.body as { tournamentId: string; status?: string }
        if (!tournamentId) {
          return res.status(400).json({ error: 'tournamentId is required' })
        }
        const tournamentRepo = new TournamentRepository(appDeps.db as any)
        const groupRepo = new TournamentGroupRepository(appDeps.db as any)

        const stageGroups = await groupRepo.findGroupsByTournament(tournamentId)
        for (const stageGroup of stageGroups) {
          const matches = await groupRepo.findMatchesByGroup(stageGroup.id)
          for (const m of matches) {
            if (m.status !== 'completed') {
              await groupRepo.updateMatch(m.id, (m.player1_id ?? m.team1_id)!, '6-3 6-4')
            }
          }
        }
        await tournamentRepo.updateStatus(tournamentId, status ?? 'tournament_complete')

        return res.json({ ok: true })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })

    // Test-only endpoint — runs the Phase C recap sweep synchronously so e2e
    // can drive it without waiting on a real hourly BullMQ cron tick.
    // Disabled in production to prevent auth bypass.
    app.post('/test/recap-sweep', async (_req: Request, res: Response) => {
      try {
        if (!appDeps.processRecapSweep) {
          return res.status(500).json({ error: 'processRecapSweep not wired (JOB_QUEUE=bullmq mode?)' })
        }
        await appDeps.processRecapSweep()
        return res.json({ ok: true })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })

    // Test-only endpoint — runs the Phase C weekly digest sweep synchronously
    // so e2e can drive it without waiting on a real BullMQ cron tick.
    // Disabled in production to prevent auth bypass.
    app.post('/test/digest-sweep', async (req: Request, res: Response) => {
      try {
        const { now } = req.body as { now?: string }
        await processDigestSweep({
          pool: appDeps.db as any,
          broadcastBus: appDeps.broadcastBus,
          ...(now ? { now: new Date(now) } : {}),
        })
        return res.json({ ok: true })
      } catch (err) {
        return res.status(500).json({ error: String(err) })
      }
    })
  }
  app.use('/api/admin', adminRouter(appDeps))

  // ─── Health endpoints ──────────────────────────────────────────────────────
  // Must be registered AFTER routers so request-id middleware applies.
  // Route order: static paths (/health/live, /health/ready) before parameterized.

  // Liveness: process is up. Never fails on dependency outage (no restart loop).
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' })
  })

  // Readiness: dependencies (DB + Redis when selected) are reachable.
  // Redis-down → 503 (ALB pulls the instance). Liveness stays 200 (no restart).
  app.get('/health/ready', async (_req: Request, res: Response) => {
    // Check database
    let dbStatus: 'connected' | 'disconnected' = 'disconnected'
    try {
      const client = await (deps.db as Pool).connect()
      try {
        await client.query('SELECT 1')
        dbStatus = 'connected'
      } finally {
        client.release()
      }
    } catch {
      // dbStatus stays 'disconnected'
    }

    // Check Redis
    const redisStatus = await probeRedisHealth(redisClient, redisIsRequired)

    // Update cached health state for the 503 guard
    healthState.set(redisStatus === 'down' ? 'down' : redisStatus === 'disabled' ? 'disabled' : 'up')

    // Check partition coverage
    let partitionCoverage: string | undefined
    if (deps.partitionManager) {
      try {
        const coverage = await deps.partitionManager.getCoverageStatus()
        partitionCoverage = coverage.level
      } catch {
        partitionCoverage = 'unknown'
      }
    }

    const isReady = dbStatus === 'connected' && redisStatus !== 'down'
    const httpStatus = isReady ? 200 : 503
    const body: Record<string, string> = {
      status: isReady ? 'ok' : 'unavailable',
      database: dbStatus,
      redis: redisStatus === 'up' ? 'connected' : redisStatus === 'disabled' ? 'disabled' : 'down',
    }
    if (partitionCoverage !== undefined) {
      body.partition_coverage = partitionCoverage
    }

    res.status(httpStatus).json(body)
  })

  // Legacy /health — preserved for backwards compatibility (same shape as V1.1/V1.2).
  // Reports status but always returns 200 (liveness semantics).
  app.get('/health', async (_req: Request, res: Response) => {
    // Check database
    let dbStatus: 'connected' | 'disconnected' = 'disconnected'
    try {
      const client = await (deps.db as Pool).connect()
      try {
        await client.query('SELECT 1')
        dbStatus = 'connected'
      } finally {
        client.release()
      }
    } catch {
      // dbStatus stays 'disconnected'
    }

    // Check Redis
    let redisStatus: 'connected' | 'down' | 'disabled'
    if (redisClient === null) {
      redisStatus = 'disabled'
    } else {
      try {
        await redisClient.ping()
        redisStatus = 'connected'
      } catch {
        redisStatus = 'down'
      }
    }

    // Check bus connectivity (RedisBroadcastBus exposes busHealthStatus(); BroadcastBus does not)
    const bus = deps.broadcastBus as any
    let busStatus: 'in-process' | 'connected' | 'down'
    if (bus && typeof bus.busHealthStatus === 'function') {
      busStatus = await bus.busHealthStatus()
    } else {
      busStatus = 'in-process'
    }

    // Check partition coverage
    let partitionCoverage: string | undefined
    if (deps.partitionManager) {
      try {
        const coverage = await deps.partitionManager.getCoverageStatus()
        partitionCoverage = coverage.level
      } catch {
        partitionCoverage = 'unknown'
      }
    }

    const body: Record<string, string> = {
      status: 'ok',
      database: dbStatus,
      redis: redisStatus,
      bus: busStatus,
    }
    if (partitionCoverage !== undefined) {
      body.partition_coverage = partitionCoverage
    }

    res.status(200).json(body)
  })

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

    // Errors with explicit statusCode (e.g. NOT_FOUND, LAST_OWNER from group routes)
    if (err instanceof Error && 'statusCode' in err) {
      const code = (err as any).code || 'ERROR'
      const statusCode = (err as any).statusCode as number
      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'debug'
      httpLog[logLevel as 'error' | 'warn' | 'debug']('error', { code, statusCode })
      return res.status(statusCode).json({ code, message: err.message })
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
