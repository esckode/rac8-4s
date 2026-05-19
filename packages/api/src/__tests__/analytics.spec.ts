import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../app'
import { PlayerRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { generatePlayerSession, MagicLinkPayload } from '../auth'
import { DEFAULT_APP_CONFIG } from '../config'
import { initializeTestDb, resetTestDb, closeTestDb } from './db-test-setup'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }

describe('Analytics Events', () => {
  let db: Pool
  let app: any
  let tokenStore: InMemoryTokenStore
  let playerRepo: PlayerRepository
  let playerId: string

  const generateToken = async (store: InMemoryTokenStore, pId: string) => {
    const payload: MagicLinkPayload = {
      playerId: pId,
      tournamentId: 'tourn_test',
      email: 'player@test.com',
      createdAt: Date.now(),
    }
    const result = await generatePlayerSession(payload, 3600, store)
    return result.token
  }

  beforeAll(async () => {
    db = await initializeTestDb()
  })

  beforeEach(async () => {
    await resetTestDb(db)
    tokenStore = new InMemoryTokenStore()
    app = createApp({ config: DEFAULT_APP_CONFIG, db, jwtConfig: STANDARD_CONFIG, tokenStore })
    playerRepo = new PlayerRepository(db)

    // Create a test player
    const player = await playerRepo.findOrCreatePlayerByEmail('player@test.com', 'Test Player', '555-1234', 'email')
    playerId = player.id
  })

  afterAll(async () => {
    await closeTestDb()
  })

  describe('POST /api/analytics/events', () => {
    it('should store analytics events successfully', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const events = [
        {
          timestamp: Date.now(),
          userId: playerId,
          eventType: 'screen_view',
          screen: 'standings',
          duration: 1500,
        },
        {
          timestamp: Date.now() + 1000,
          userId: playerId,
          eventType: 'time_to_data',
          screen: 'matches',
          duration: 450,
          data: { apiDuration: 250, renderDuration: 200 },
        },
      ]

      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ events })

      expect(res.status).toBe(204)

      // Verify events were stored in database
      const result = await db.query('SELECT * FROM public.user_events WHERE user_id = $1', [playerId])
      const storedEvents = result.rows as any[]
      expect(storedEvents).toHaveLength(2)
      expect(storedEvents[0].event_type).toBe('screen_view')
      expect(storedEvents[0].screen).toBe('standings')
      expect(storedEvents[0].duration).toBe(1500)
      expect(storedEvents[1].event_type).toBe('time_to_data')
      expect(storedEvents[1].screen).toBe('matches')
      expect(JSON.parse(storedEvents[1].data)).toEqual({
        apiDuration: 250,
        renderDuration: 200,
      })
    })

    it('should return 400 if events array is missing', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_EVENTS')
    })

    it('should return 400 if events array is empty', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ events: [] })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_EVENTS')
    })

    it('should return 400 if event is missing eventType', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const events = [
        {
          timestamp: Date.now(),
          userId: playerId,
          screen: 'standings',
        },
      ]

      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ events })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_EVENT')
      expect(res.body.message).toContain('eventType')
    })

    it('should return 401 if not authenticated', async () => {
      const events = [
        {
          timestamp: Date.now(),
          userId: playerId,
          eventType: 'screen_view',
          screen: 'standings',
        },
      ]

      const res = await request(app).post('/api/analytics/events').send({ events })

      expect(res.status).toBe(401)
    })

    it('should handle optional fields (screen, duration, data)', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const events = [
        {
          timestamp: Date.now(),
          userId: playerId,
          eventType: 'screen_view',
        },
      ]

      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ events })

      expect(res.status).toBe(204)

      const result = await db.query('SELECT * FROM public.user_events WHERE user_id = $1 AND event_type = $2', [playerId, 'screen_view'])
      const storedEvent = result.rows[0] as any

      expect(storedEvent.screen).toBeNull()
      expect(storedEvent.duration).toBeNull()
      expect(storedEvent.data).toBeNull()
    })

    it('should store multiple events with correct metadata', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const events = [
        {
          timestamp: Date.now(),
          userId: playerId,
          eventType: 'screen_view',
          screen: 'standings',
        },
        {
          timestamp: Date.now() + 1000,
          userId: playerId,
          eventType: 'screen_view',
          screen: 'matches',
        },
        {
          timestamp: Date.now() + 2000,
          userId: playerId,
          eventType: 'sse_update',
          screen: 'standings',
          duration: 100,
        },
      ]

      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ events })

      expect(res.status).toBe(204)

      const result = await db.query('SELECT * FROM public.user_events WHERE user_id = $1 ORDER BY created_at', [playerId])
      const storedEvents = result.rows as any[]
      expect(storedEvents).toHaveLength(3)
      expect(storedEvents.map((e) => e.event_type)).toEqual(['screen_view', 'screen_view', 'sse_update'])
      expect(storedEvents.map((e) => e.screen)).toEqual(['standings', 'matches', 'standings'])
    })

    it('should store complex data as JSON', async () => {
      const playerToken = await generateToken(tokenStore, playerId)
      const complexData = {
        apiDuration: 250,
        renderDuration: 200,
        networkLatency: 50,
        metrics: {
          fcp: 1200,
          tti: 2500,
          lcp: 1800,
        },
      }

      const events = [
        {
          timestamp: Date.now(),
          userId: playerId,
          eventType: 'performance',
          data: complexData,
        },
      ]

      const res = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', `Bearer ${playerToken}`)
        .send({ events })

      expect(res.status).toBe(204)

      const result = await db.query('SELECT * FROM public.user_events WHERE user_id = $1 AND event_type = $2', [playerId, 'performance'])
      const storedEvent = result.rows[0] as any

      expect(JSON.parse(storedEvent.data)).toEqual(complexData)
    })
  })
})
