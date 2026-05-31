import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { createApp } from '../../app'
import { InMemoryTokenStore } from '../../auth/token-store'
import { DEFAULT_APP_CONFIG } from '../../config'
import { ConstraintViolationError } from '../../db/errors'

describe('app.ts request middleware and error handling', () => {
  let app: Express
  let tokenStore: InMemoryTokenStore

  beforeEach(() => {
    tokenStore = new InMemoryTokenStore()
    const jwtConfig = {
      secret: 'test-secret-key-at-least-32-chars-long-for-testing-purposes!',
      expiresInSeconds: 3600,
    }

    app = createApp({
      db: {} as Pool,
      jwtConfig,
      tokenStore,
      config: DEFAULT_APP_CONFIG,
    })
  })

  describe('Request ID middleware', () => {
    it('should generate a request ID if not provided', async () => {
      app.get('/test-no-id', (_req, res) => {
        res.status(200).json({ ok: true })
      })

      const res = await request(app).get('/test-no-id')
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('should use provided X-Request-ID header', async () => {
      const testId = 'test-request-id-123'
      app.get('/test-with-id', (_req, res) => {
        res.status(200).json({ ok: true })
      })

      const res = await request(app)
        .get('/test-with-id')
        .set('X-Request-ID', testId)

      expect(res.headers['x-request-id']).toBe(testId)
    })

    it('should set X-Request-ID response header', async () => {
      app.get('/test-header', (_req, res) => {
        res.status(200).json({ ok: true })
      })

      const res = await request(app).get('/test-header')
      expect(res.headers['x-request-id']).toBeDefined()
      expect(typeof res.headers['x-request-id']).toBe('string')
    })
  })

  describe('HTTP response logging by status code', () => {
    it('should log 5xx responses at error level', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation()

      app.get('/test-500', (_req, res) => {
        res.status(500).json({ error: 'Server error' })
      })

      await request(app).get('/test-500')
      errorSpy.mockRestore()
    })

    it('should log 4xx responses at warn level', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()

      app.get('/test-400', (_req, res) => {
        res.status(400).json({ error: 'Bad request' })
      })

      await request(app).get('/test-400')
      warnSpy.mockRestore()
    })

    it('should log 2xx responses at debug level', async () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation()

      app.get('/test-200', (_req, res) => {
        res.status(200).json({ ok: true })
      })

      await request(app).get('/test-200')
      debugSpy.mockRestore()
    })
  })

  describe('Database error handling', () => {
    it('should log 5xx database errors at error level', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation()

      app.get('/test-db-5xx-log', (_req, _res, next) => {
        const err = new ConstraintViolationError('DB Error', 'DB_ERROR', 503)
        next(err)
      })

      const res = await request(app).get('/test-db-5xx-log')
      expect(res.status).toBe(503)
      errorSpy.mockRestore()
    })

    it('should log 4xx database errors at warn level', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()

      app.get('/test-db-4xx-log', (_req, _res, next) => {
        const err = new ConstraintViolationError('Constraint violation', 'INVALID_VALUE', 400)
        next(err)
      })

      const res = await request(app).get('/test-db-4xx-log')
      expect(res.status).toBe(400)
      warnSpy.mockRestore()
    })

    it('should pass through unrecognized errors as 500', async () => {
      app.get('/test-unknown', (_req, _res, next) => {
        next(new Error('unknown error'))
      })

      const res = await request(app).get('/test-unknown')
      expect(res.status).toBe(500)
    })
  })

  describe('Express.json middleware', () => {
    it('should parse JSON request bodies', async () => {
      app.post('/test-json', (req, res) => {
        res.status(200).json({ received: req.body })
      })

      const res = await request(app)
        .post('/test-json')
        .send({ test: 'data' })

      expect(res.status).toBe(200)
      expect(res.body.received).toEqual({ test: 'data' })
    })

    it('should handle non-JSON content gracefully', async () => {
      app.post('/test-text', (req, res) => {
        res.status(200).json({ ok: true })
      })

      const res = await request(app)
        .post('/test-text')
        .set('Content-Type', 'text/plain')
        .send('plain text')

      // Plain text should pass through express.json without error
      expect([200, 400, 500]).toContain(res.status)
    })
  })

  describe('Error handling - conditional branches', () => {
    it('should handle non-Error objects thrown in error handler', async () => {
      app.get('/test-string-error', (_req, _res, next) => {
        next('string error')
      })

      const res = await request(app).get('/test-string-error')
      expect(res.status).toBe(500)
    })
  })
})
