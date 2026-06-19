import { Router, Request, Response, NextFunction } from 'express'
import { AppDependencies } from '../app'
import { getLogger } from '../logger'
import { requirePlayerSessionAuth } from '../auth'

const log = getLogger('analytics')

interface AnalyticsEventInput {
  timestamp: number
  userId: string
  eventType: string
  locale?: string
  screen?: string
  duration?: number
  data?: Record<string, any>
}

export default function analyticsRouter(deps: AppDependencies) {
  const router = Router()

  router.post('/events', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)

      const { events } = req.body

      if (!Array.isArray(events) || events.length === 0) {
        res.status(400).json({ code: 'INVALID_EVENTS', message: 'events must be a non-empty array' })
        return
      }

      const eventTypes = new Set<string>()

      for (const event of events) {
        const typedEvent = event as AnalyticsEventInput

        if (!typedEvent.eventType || typeof typedEvent.eventType !== 'string') {
          res.status(400).json({ code: 'INVALID_EVENT', message: 'eventType is required' })
          return
        }

        eventTypes.add(typedEvent.eventType)

        const eventId = `event_${Date.now()}_${Math.random().toString(36).slice(2)}`
        await deps.db.query(
          `INSERT INTO public.user_events (id, user_id, event_type, screen, duration, data, locale, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            eventId,
            payload.playerId,
            typedEvent.eventType,
            typedEvent.screen || null,
            typedEvent.duration || null,
            typedEvent.data ? JSON.stringify(typedEvent.data) : null,
            typeof typedEvent.locale === 'string' ? typedEvent.locale.slice(0, 35) : null,
          ]
        )
      }

      log.info('analytics.batch_received', {
        userId: payload.playerId,
        eventCount: events.length,
        eventTypes: Array.from(eventTypes).join(','),
      })

      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })

  return router
}
