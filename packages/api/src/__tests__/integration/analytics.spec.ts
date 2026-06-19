import request from 'supertest'
import { Pool } from 'pg'
import { Express } from 'express'
import { getTestPool, closeTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory, AnalyticsFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'

describe('Analytics API', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)

    const testApp = createTestApp(pool)
    app = testApp.app
    tokenStore = testApp.tokenStore
  })

  afterAll(async () => {
    await rollbackTransaction()
    await closeTestPool()
  })

  async function createPlayerWithToken(tournamentId: string) {
    const player = await PlayerFactory.create(pool)
    const session = await generatePlayerSession(
      {
        playerId: player.id,
        tournamentId,
        email: player.email,
        createdAt: Date.now(),
      },
      3600,
      tokenStore
    )
    return { player, sessionToken: session.token }
  }

  describe('POST /api/analytics/events', () => {
    describe('Authentication', () => {
      it('rejects requests without authorization header', async () => {
        const payload = AnalyticsFactory.batch(1)

        const res = await request(app).post('/api/analytics/events').send(payload)

        expect(res.status).toBe(401)
      })

      it('rejects requests with invalid token', async () => {
        const payload = AnalyticsFactory.batch(1)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', 'Bearer invalid-token-xyz')
          .send(payload)

        expect(res.status).toBe(401)
      })

      it('accepts valid player session tokens', async () => {
        const { sub: organizerId } = OrganizerFactory.token({
          secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
          expiresInSeconds: 3600,
        })
        const tournament = await TournamentFactory.create(pool, organizerId)
        const { sessionToken } = await createPlayerWithToken(tournament.id)

        const payload = AnalyticsFactory.batch(1)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })
    })

    describe('Request Validation', () => {
      let playerToken: string

      beforeAll(async () => {
        const { sub: organizerId } = OrganizerFactory.token({
          secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
          expiresInSeconds: 3600,
        })
        const tournament = await TournamentFactory.create(pool, organizerId)
        const result = await createPlayerWithToken(tournament.id)
        playerToken = result.sessionToken
      })

      it('rejects missing events field', async () => {
        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send({})

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('INVALID_EVENTS')
      })

      it('rejects non-array events field', async () => {
        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send({ events: 'not-an-array' })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('INVALID_EVENTS')
      })

      it('rejects empty events array', async () => {
        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send({ events: [] })

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('INVALID_EVENTS')
      })

      it('rejects event with missing eventType', async () => {
        const payload = {
          events: [
            {
              timestamp: Date.now(),
              userId: 'player-123',
              screen: '/tournaments',
            },
          ],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('INVALID_EVENT')
      })

      it('rejects event with non-string eventType', async () => {
        const payload = {
          events: [
            {
              timestamp: Date.now(),
              userId: 'player-123',
              eventType: 123,
            },
          ],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(400)
        expect(res.body.code).toBe('INVALID_EVENT')
      })

      it('rejects event with empty eventType string', async () => {
        const payload = {
          events: [
            {
              timestamp: Date.now(),
              userId: 'player-123',
              eventType: '',
            },
          ],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(400)
      })
    })

    describe('Successful Event Submission', () => {
      let playerToken: string

      beforeAll(async () => {
        const { sub: organizerId } = OrganizerFactory.token({
          secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
          expiresInSeconds: 3600,
        })
        const tournament = await TournamentFactory.create(pool, organizerId)
        const result = await createPlayerWithToken(tournament.id)
        playerToken = result.sessionToken
      })

      it('accepts single event and returns 204', async () => {
        const payload = AnalyticsFactory.batch(1)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts multiple events in single batch', async () => {
        const payload = AnalyticsFactory.batch(5)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts 50 events in single batch', async () => {
        const payload = AnalyticsFactory.batch(50)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts 100 events in single batch', async () => {
        const payload = AnalyticsFactory.batch(100)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })
    })

    describe('Event Type Variety', () => {
      let playerToken: string

      beforeAll(async () => {
        const { sub: organizerId } = OrganizerFactory.token({
          secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
          expiresInSeconds: 3600,
        })
        const tournament = await TournamentFactory.create(pool, organizerId)
        const result = await createPlayerWithToken(tournament.id)
        playerToken = result.sessionToken
      })

      it('accepts page_view events', async () => {
        const payload = {
          events: [AnalyticsFactory.screenViewEvent('/tournaments')],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts button_click events', async () => {
        const payload = {
          events: [AnalyticsFactory.buttonClickEvent('register-button')],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts form_submit events', async () => {
        const payload = {
          events: [AnalyticsFactory.formSubmitEvent('tournament-registration')],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts timed events with duration', async () => {
        const payload = {
          events: [AnalyticsFactory.timedEvent(3600)],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts custom event types with arbitrary data', async () => {
        const payload = {
          events: [AnalyticsFactory.customEvent('custom_action', { meta: 'value', score: 42 })],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })

      it('accepts multiple different event types in single batch', async () => {
        const payload = {
          events: [
            AnalyticsFactory.screenViewEvent('/home'),
            AnalyticsFactory.buttonClickEvent('join-button'),
            AnalyticsFactory.formSubmitEvent('bracket-submission'),
            AnalyticsFactory.customEvent('match_completed', { match_id: 'match_123' }),
          ],
        }

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${playerToken}`)
          .send(payload)

        expect(res.status).toBe(204)
      })
    })

    describe('Locale capture', () => {
      it('stores the client locale on the event row', async () => {
        const { sub: organizerId } = OrganizerFactory.token({
          secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
          expiresInSeconds: 3600,
        })
        const tournament = await TournamentFactory.create(pool, organizerId)
        const { player, sessionToken } = await createPlayerWithToken(tournament.id)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({
            events: [
              { timestamp: Date.now(), userId: player.id, eventType: 'page_view', screen: '/standings', locale: 'es-419' },
            ],
          })

        expect(res.status).toBe(204)

        const rows = await pool.query('SELECT locale FROM public.user_events WHERE user_id = $1', [player.id])
        expect(rows.rows[0].locale).toBe('es-419')
      })

      it('stores null locale when the client omits it', async () => {
        const { sub: organizerId } = OrganizerFactory.token({
          secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
          expiresInSeconds: 3600,
        })
        const tournament = await TournamentFactory.create(pool, organizerId)
        const { player, sessionToken } = await createPlayerWithToken(tournament.id)

        const res = await request(app)
          .post('/api/analytics/events')
          .set('Authorization', `Bearer ${sessionToken}`)
          .send({ events: [{ timestamp: Date.now(), userId: player.id, eventType: 'page_view' }] })

        expect(res.status).toBe(204)

        const rows = await pool.query('SELECT locale FROM public.user_events WHERE user_id = $1', [player.id])
        expect(rows.rows[0].locale).toBeNull()
      })
    })
  })
})
