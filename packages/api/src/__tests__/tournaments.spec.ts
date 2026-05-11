import request from 'supertest'
import Database from 'better-sqlite3'
import { createApp } from '../app'
import { openDatabase, TournamentRepository } from '../db'
import { InMemoryTokenStore, issueOrganizerToken } from '../auth'
import type { JwtConfig } from '../auth'

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long-for-testing!'
const STANDARD_CONFIG: JwtConfig = { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 }

describe('Tournament CRUD Endpoints', () => {
  let db: Database.Database
  let tokenStore: InMemoryTokenStore
  let app: any
  let organizerToken: string
  const organizerId = 'org_test_001'
  const organizerEmail = 'organizer@test.com'

  beforeEach(() => {
    tokenStore = new InMemoryTokenStore()
    db = openDatabase(':memory:')
    app = createApp({
      db,
      jwtConfig: STANDARD_CONFIG,
      tokenStore,
    })

    const tokenPair = issueOrganizerToken(
      {
        sub: organizerId,
        email: organizerEmail,
      },
      STANDARD_CONFIG
    )
    organizerToken = tokenPair.accessToken
  })

  afterEach(() => {
    if (db) db.close()
  })

  describe('POST /tournaments', () => {
    it('should create a tournament with valid input', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Spring Tennis 2026',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(201)
      expect(response.body.id).toBeDefined()
      expect(response.body.name).toBe('Spring Tennis 2026')
      expect(response.body.status).toBe('draft')
      expect(response.body.createdBy).toBe(organizerId)
    })

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Tournament',
          // missing sport, matchFormat, etc
        })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
    })

    it('should reject invalid matchFormat', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Tournament',
          sport: 'tennis',
          matchFormat: 'invalid',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('matchFormat')
    })

    it('should reject maxPlayers out of range (low)', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 2,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('maxPlayers')
    })

    it('should reject maxPlayers out of range (high)', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 300,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('maxPlayers')
    })

    it('should reject deadline ordering violations', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-30T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-01T00:00:00Z',
        })

      expect(response.status).toBe(400)
      expect(response.body.message).toContain('deadline ordering')
    })

    it('should reject duplicate tournament name', async () => {
      await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Unique Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Unique Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('DUPLICATE_NAME')
    })

    it('should reject missing auth token', async () => {
      const response = await request(app)
        .post('/tournaments')
        .send({
          name: 'Test Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('UNAUTHORIZED')
    })

    it('should accept optional description', async () => {
      const response = await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Test Tournament',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          description: 'A great tournament',
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      expect(response.status).toBe(201)
    })
  })

  describe('GET /organizer/tournaments', () => {
    it('should list organizer tournaments', async () => {
      await request(app)
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Tournament 1',
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
        })

      const response = await request(app)
        .get('/tournaments/organizer')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(1)
      expect(response.body.tournaments[0].name).toBe('Tournament 1')
      expect(response.body.pagination).toEqual({
        offset: 0,
        limit: 10,
        total: 1,
        hasMore: false,
      })
    })

    it('should support pagination', async () => {
      for (let i = 1; i <= 15; i++) {
        await request(app)
          .post('/tournaments')
          .set('Authorization', `Bearer ${organizerToken}`)
          .send({
            name: `Tournament ${i}`,
            sport: 'tennis',
            matchFormat: 'singles',
            maxPlayers: 32,
            registrationDeadline: '2026-06-01T00:00:00Z',
            groupStageDeadline: '2026-06-15T00:00:00Z',
            knockoutStageDeadline: '2026-06-30T00:00:00Z',
          })
      }

      const response = await request(app)
        .get('/tournaments/organizer')
        .query({ offset: 10, limit: 5 })
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(5)
      expect(response.body.pagination.offset).toBe(10)
      expect(response.body.pagination.limit).toBe(5)
      expect(response.body.pagination.total).toBe(15)
      expect(response.body.pagination.hasMore).toBe(false)
    })

    it('should filter by status', async () => {
      const repo = new TournamentRepository(db)

      const t1 = repo.create({
        name: 'Draft Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const t2 = repo.create({
        name: 'Open Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      // Manually update status
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', t2.id)

      const response = await request(app)
        .get('/tournaments/organizer')
        .query({ status: 'draft' })
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(1)
      expect(response.body.tournaments[0].name).toBe('Draft Tournament')
    })

    it('should reject missing auth token', async () => {
      const response = await request(app)
        .get('/tournaments/organizer')

      expect(response.status).toBe(401)
    })

    it('should exclude soft-deleted tournaments', async () => {
      const repo = new TournamentRepository(db)

      const t1 = repo.create({
        name: 'Active Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const t2 = repo.create({
        name: 'Deleted Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      repo.softDelete(t2.id)

      const response = await request(app)
        .get('/tournaments/organizer')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(1)
      expect(response.body.tournaments[0].name).toBe('Active Tournament')
    })
  })

  describe('GET /tournaments/public', () => {
    it('should list public tournaments', async () => {
      const repo = new TournamentRepository(db)

      const draft = repo.create({
        name: 'Draft Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const open = repo.create({
        name: 'Open Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', open.id)

      const response = await request(app)
        .get('/tournaments/public')

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(1)
      expect(response.body.tournaments[0].name).toBe('Open Tournament')
    })

    it('should include group_stage and knockout statuses', async () => {
      const repo = new TournamentRepository(db)

      const statuses = ['registration_open', 'group_stage_active', 'knockout_active']
      for (const status of statuses) {
        const t = repo.create({
          name: `Tournament ${status}`,
          sport: 'tennis',
          matchFormat: 'singles',
          maxPlayers: 32,
          registrationDeadline: '2026-06-01T00:00:00Z',
          groupStageDeadline: '2026-06-15T00:00:00Z',
          knockoutStageDeadline: '2026-06-30T00:00:00Z',
          creatorId: organizerId,
        })
        db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(status, t.id)
      }

      const response = await request(app)
        .get('/tournaments/public')

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(3)
    })

    it('should filter by sport', async () => {
      const repo = new TournamentRepository(db)

      const tennis = repo.create({
        name: 'Tennis Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', tennis.id)

      const pickle = repo.create({
        name: 'Pickleball Tournament',
        sport: 'pickleball',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', pickle.id)

      const response = await request(app)
        .get('/tournaments/public')
        .query({ sport: 'tennis' })

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(1)
      expect(response.body.tournaments[0].sport).toBe('tennis')
    })

    it('should exclude soft-deleted tournaments', async () => {
      const repo = new TournamentRepository(db)

      const t1 = repo.create({
        name: 'Active Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', t1.id)

      const t2 = repo.create({
        name: 'Deleted Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', t2.id)

      repo.softDelete(t2.id)

      const response = await request(app)
        .get('/tournaments/public')

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(1)
      expect(response.body.tournaments[0].name).toBe('Active Tournament')
    })

    it('should not require auth', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Public Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', t.id)

      const response = await request(app)
        .get('/tournaments/public')
        // no auth header

      expect(response.status).toBe(200)
    })
  })

  describe('PATCH /tournaments/:id', () => {
    it('should update tournament details', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Original Name',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .patch(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: 'Updated Name',
          maxPlayers: 64,
        })

      expect(response.status).toBe(200)
      expect(response.body.name).toBe('Updated Name')
      expect(response.body.maxPlayers).toBe(64)
    })

    it('should reject invalid name', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .patch(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: '' })

      expect(response.status).toBe(400)
    })

    it('should reject invalid maxPlayers', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .patch(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ maxPlayers: 2 })

      expect(response.status).toBe(400)
    })

    it('should reject duplicate name', async () => {
      const repo = new TournamentRepository(db)
      const t1 = repo.create({
        name: 'Tournament A',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const t2 = repo.create({
        name: 'Tournament B',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .patch(`/tournaments/${t2.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Tournament A' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('DUPLICATE_NAME')
    })

    it('should return 403 for non-creator organizer', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: 'other_organizer',
      })

      const response = await request(app)
        .patch(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Updated Name' })

      expect(response.status).toBe(403)
    })

    it('should return 404 for non-existent tournament', async () => {
      const response = await request(app)
        .patch('/tournaments/nonexistent_id')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Updated Name' })

      expect(response.status).toBe(404)
    })

    it('should reject missing auth token', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .patch(`/tournaments/${t.id}`)
        .send({ name: 'Updated Name' })

      expect(response.status).toBe(401)
    })

    it('should update only provided fields', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        description: 'Original description',
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .patch(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ maxPlayers: 64 })

      expect(response.status).toBe(200)
      expect(response.body.maxPlayers).toBe(64)
      expect(response.body.name).toBe('Test Tournament')
      expect(response.body.description).toBe('Original description')
    })
  })

  describe('DELETE /tournaments/:id', () => {
    it('should soft delete tournament', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .delete(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(204)

      // Verify soft delete
      const deleted = repo.findById(t.id)!
      expect(deleted.deleted_at).toBeDefined()
    })

    it('should exclude soft-deleted from public listing', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })
      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('registration_open', t.id)

      await request(app)
        .delete(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)

      const response = await request(app)
        .get('/tournaments/public')

      expect(response.status).toBe(200)
      expect(response.body.tournaments).toHaveLength(0)
    })

    it('should return 403 for non-creator organizer', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: 'other_organizer',
      })

      const response = await request(app)
        .delete(`/tournaments/${t.id}`)
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(403)
    })

    it('should return 404 for non-existent tournament', async () => {
      const response = await request(app)
        .delete('/tournaments/nonexistent_id')
        .set('Authorization', `Bearer ${organizerToken}`)

      expect(response.status).toBe(404)
    })

    it('should reject missing auth token', async () => {
      const repo = new TournamentRepository(db)
      const t = repo.create({
        name: 'Test Tournament',
        sport: 'tennis',
        matchFormat: 'singles',
        maxPlayers: 32,
        registrationDeadline: '2026-06-01T00:00:00Z',
        groupStageDeadline: '2026-06-15T00:00:00Z',
        knockoutStageDeadline: '2026-06-30T00:00:00Z',
        creatorId: organizerId,
      })

      const response = await request(app)
        .delete(`/tournaments/${t.id}`)

      expect(response.status).toBe(401)
    })
  })
})
