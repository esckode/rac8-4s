import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { LocationRepository, CourtRepository } from '../../db'
import { NotFoundError, CheckConstraintError } from '../../db/errors'
import { LocationFactory, CourtFactory } from '../factories'

describe('Locations and Courts', () => {
  let pool: Pool
  let locationRepo: LocationRepository
  let courtRepo: CourtRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    locationRepo = new LocationRepository(pool)
    courtRepo = new CourtRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('LocationRepository', () => {
    describe('create', () => {
      it('creates a location with required fields', async () => {
        const data = LocationFactory.data()
        const location = await locationRepo.create(data)

        expect(location.id).toBeDefined()
        expect(location.name).toBe(data.name)
        expect(location.sport).toBe(data.sport)
        expect(location.latitude).toBeCloseTo(data.latitude, 4)
        expect(location.longitude).toBeCloseTo(data.longitude, 4)
        expect(location.total_courts).toBe(data.totalCourts)
        expect(location.restricted).toBe(false)
        expect(location.created_at).toBeDefined()
        expect(location.updated_at).toBeDefined()
      })

      it('creates a location with restricted flag', async () => {
        const data = LocationFactory.data({ restricted: true })
        const location = await locationRepo.create(data)

        expect(location.restricted).toBe(true)
      })

      it('creates a location with entry conditions', async () => {
        const conditions = 'Members only, valid ID required'
        const data = LocationFactory.data({ entryConditions: conditions })
        const location = await locationRepo.create(data)

        expect(location.entry_conditions).toBe(conditions)
      })

      it('generates unique IDs for each location', async () => {
        const loc1 = await LocationFactory.create(pool)
        const loc2 = await LocationFactory.create(pool)

        expect(loc1.id).not.toBe(loc2.id)
      })
    })

    describe('findById', () => {
      it('retrieves a location by ID', async () => {
        const created = await LocationFactory.create(pool)
        const found = await locationRepo.findById(created.id)

        expect(found).toBeDefined()
        expect(found?.id).toBe(created.id)
        expect(found?.name).toBe(created.name)
      })

      it('returns undefined for non-existent location', async () => {
        const found = await locationRepo.findById('location_nonexistent')
        expect(found).toBeUndefined()
      })

      it('excludes soft-deleted locations', async () => {
        const created = await LocationFactory.create(pool)
        await locationRepo.softDelete(created.id)

        const found = await locationRepo.findById(created.id)
        expect(found).toBeUndefined()
      })
    })

    describe('findBySport', () => {
      it('lists locations by sport', async () => {
        const tennis1 = await LocationFactory.create(pool, { sport: 'tennis' })
        const tennis2 = await LocationFactory.create(pool, { sport: 'tennis' })
        const basketball = await LocationFactory.create(pool, { sport: 'basketball' })

        const result = await locationRepo.findBySport('tennis')

        expect(result.rows.length).toBeGreaterThanOrEqual(2)
        expect(result.rows.map((l: any) => l.id)).toContain(tennis1.id)
        expect(result.rows.map((l: any) => l.id)).toContain(tennis2.id)
      })

      it('excludes soft-deleted locations from sport query', async () => {
        const created = await LocationFactory.create(pool, { sport: 'badminton' })
        await locationRepo.softDelete(created.id)

        const result = await locationRepo.findBySport('badminton')

        expect(result.rows.map((l: any) => l.id)).not.toContain(created.id)
      })

      it('respects limit and offset options', async () => {
        // Create 3 squash locations
        await LocationFactory.create(pool, { sport: 'squash' })
        await LocationFactory.create(pool, { sport: 'squash' })
        await LocationFactory.create(pool, { sport: 'squash' })

        const firstPage = await locationRepo.findBySport('squash', { limit: 2, offset: 0 })
        const secondPage = await locationRepo.findBySport('squash', { limit: 2, offset: 2 })

        expect(firstPage.rows.length).toBeLessThanOrEqual(2)
        expect(secondPage.rows.length).toBeLessThanOrEqual(2)
      })

      it('returns total count', async () => {
        const result = await locationRepo.findBySport('tennis')
        expect(result.total).toBeGreaterThan(0)
        expect(typeof result.total).toBe('number')
      })
    })

    describe('listAll', () => {
      it('lists all locations', async () => {
        const created = await LocationFactory.create(pool)

        const result = await locationRepo.listAll()

        expect(result.rows.length).toBeGreaterThan(0)
        expect(result.rows.map((l: any) => l.id)).toContain(created.id)
      })

      it('excludes soft-deleted locations', async () => {
        const created = await LocationFactory.create(pool)
        await locationRepo.softDelete(created.id)

        const result = await locationRepo.listAll()

        expect(result.rows.map((l: any) => l.id)).not.toContain(created.id)
      })

      it('returns total count', async () => {
        const result = await locationRepo.listAll()
        expect(result.total).toBeGreaterThan(0)
        expect(typeof result.total).toBe('number')
      })
    })

    describe('update', () => {
      it('updates location name', async () => {
        const created = await LocationFactory.create(pool)
        const newName = `updated-location-${Date.now()}`

        const updated = await locationRepo.update(created.id, { name: newName })

        expect(updated.name).toBe(newName)
        expect(updated.updated_at).not.toBe(created.updated_at)
      })

      it('updates totalCourts', async () => {
        const created = await LocationFactory.create(pool, { totalCourts: 2 })

        const updated = await locationRepo.update(created.id, { totalCourts: 6 })

        expect(updated.total_courts).toBe(6)
      })

      it('updates restricted status', async () => {
        const created = await LocationFactory.create(pool, { restricted: false })

        const updated = await locationRepo.update(created.id, { restricted: true })

        expect(updated.restricted).toBe(true)
      })

      it('updates entry conditions', async () => {
        const created = await LocationFactory.create(pool)
        const newConditions = 'New access rules'

        const updated = await locationRepo.update(created.id, { entryConditions: newConditions })

        expect(updated.entry_conditions).toBe(newConditions)
      })

      it('throws NotFoundError for non-existent location', async () => {
        await expect(
          locationRepo.update('location_nonexistent', { name: 'new' })
        ).rejects.toThrow(NotFoundError)
      })

      it('allows partial updates', async () => {
        const created = await LocationFactory.create(pool, {
          name: 'original',
          totalCourts: 5,
        })

        const updated = await locationRepo.update(created.id, { name: 'changed' })

        expect(updated.name).toBe('changed')
        expect(updated.total_courts).toBe(5)
      })
    })

    describe('calculateCapacity', () => {
      it('returns total courts for location with all available courts', async () => {
        const location = await LocationFactory.create(pool, { totalCourts: 3 })
        await CourtFactory.createMany(pool, location.id, 3, 'available')

        const capacity = await locationRepo.calculateCapacity(location.id)

        expect(capacity).toBe(3)
      })

      it('returns reduced capacity for unavailable courts', async () => {
        const location = await LocationFactory.create(pool, { totalCourts: 4 })
        await CourtFactory.createMany(pool, location.id, 2, 'available')
        await CourtFactory.createMany(pool, location.id, 2, 'unavailable')

        const capacity = await locationRepo.calculateCapacity(location.id)

        expect(capacity).toBe(2)
      })

      it('returns zero for location with no available courts', async () => {
        const location = await LocationFactory.create(pool, { totalCourts: 2 })
        await CourtFactory.createMany(pool, location.id, 2, 'maintenance')

        const capacity = await locationRepo.calculateCapacity(location.id)

        expect(capacity).toBe(0)
      })

      it('returns total courts for location with no courts created', async () => {
        const location = await LocationFactory.create(pool, { totalCourts: 5 })

        const capacity = await locationRepo.calculateCapacity(location.id)

        expect(capacity).toBe(5)
      })

      it('returns 0 for non-existent location', async () => {
        const capacity = await locationRepo.calculateCapacity('location_nonexistent')
        expect(capacity).toBe(0)
      })
    })

    describe('findNearby', () => {
      it('finds locations within radius', async () => {
        const loc1 = await LocationFactory.create(pool, {
          latitude: 40.7128,
          longitude: -74.006,
        })
        const loc2 = await LocationFactory.create(pool, {
          latitude: 40.7129,
          longitude: -74.0059,
        })
        const loc3 = await LocationFactory.create(pool, {
          latitude: 50.0,
          longitude: -100.0,
        })

        const nearby = await locationRepo.findNearby(40.7128, -74.006, 0.025)

        expect(nearby.length).toBeGreaterThan(0)
        expect(nearby.map((l: any) => l.id)).toContain(loc1.id)
        // loc2 should be within small radius
        expect(nearby.map((l: any) => l.id)).toContain(loc2.id)
        // loc3 is far away and shouldn't be included
        expect(nearby.map((l: any) => l.id)).not.toContain(loc3.id)
      })

      it('uses default radius when not provided', async () => {
        const loc = await LocationFactory.create(pool, {
          latitude: 40.7128,
          longitude: -74.006,
        })

        const nearby = await locationRepo.findNearby(40.7128, -74.006)

        expect(nearby.length).toBeGreaterThan(0)
        expect(nearby.map((l: any) => l.id)).toContain(loc.id)
      })

      it('excludes soft-deleted locations from nearby search', async () => {
        const created = await LocationFactory.create(pool, {
          latitude: 40.7128,
          longitude: -74.006,
        })
        await locationRepo.softDelete(created.id)

        const nearby = await locationRepo.findNearby(40.7128, -74.006, 0.025)

        expect(nearby.map((l: any) => l.id)).not.toContain(created.id)
      })
    })

    describe('softDelete', () => {
      it('soft deletes a location', async () => {
        const created = await LocationFactory.create(pool)

        await locationRepo.softDelete(created.id)

        const found = await locationRepo.findById(created.id)
        expect(found).toBeUndefined()
      })

      it('allows re-querying deleted location for audit', async () => {
        const created = await LocationFactory.create(pool)
        await locationRepo.softDelete(created.id)

        // Query with deleted_at filter would show it, but findById excludes deleted
        const result = await pool.query('SELECT * FROM public.locations WHERE id = $1', [created.id])
        expect(result.rows[0]).toBeDefined()
        expect(result.rows[0].deleted_at).toBeDefined()
      })
    })
  })

  describe('CourtRepository', () => {
    describe('create', () => {
      it('creates a court with default status', async () => {
        const location = await LocationFactory.create(pool)
        const court = await courtRepo.create({ locationId: location.id })

        expect(court.id).toBeDefined()
        expect(court.location_id).toBe(location.id)
        expect(court.status).toBe('available')
        expect(court.created_at).toBeDefined()
        expect(court.updated_at).toBeDefined()
      })

      it('creates a court with specified status', async () => {
        const location = await LocationFactory.create(pool)
        const court = await courtRepo.create({
          locationId: location.id,
          status: 'maintenance',
        })

        expect(court.status).toBe('maintenance')
      })

      it('generates unique IDs for each court', async () => {
        const location = await LocationFactory.create(pool)
        const court1 = await CourtFactory.create(pool, location.id)
        const court2 = await CourtFactory.create(pool, location.id)

        expect(court1.id).not.toBe(court2.id)
      })

      it('rejects invalid status', async () => {
        const location = await LocationFactory.create(pool)

        await expect(
          courtRepo.create({
            locationId: location.id,
            status: 'invalid' as any,
          })
        ).rejects.toThrow(CheckConstraintError)
      })
    })

    describe('findById', () => {
      it('retrieves a court by ID', async () => {
        const location = await LocationFactory.create(pool)
        const created = await CourtFactory.create(pool, location.id)

        const found = await courtRepo.findById(created.id)

        expect(found).toBeDefined()
        expect(found?.id).toBe(created.id)
        expect(found?.location_id).toBe(location.id)
      })

      it('returns undefined for non-existent court', async () => {
        const found = await courtRepo.findById('court_nonexistent')
        expect(found).toBeUndefined()
      })
    })

    describe('findByLocation', () => {
      it('lists courts for a location', async () => {
        const location = await LocationFactory.create(pool)
        const court1 = await CourtFactory.create(pool, location.id)
        const court2 = await CourtFactory.create(pool, location.id)

        const courts = await courtRepo.findByLocation(location.id)

        expect(courts.length).toBeGreaterThanOrEqual(2)
        expect(courts.map((c: any) => c.id)).toContain(court1.id)
        expect(courts.map((c: any) => c.id)).toContain(court2.id)
      })

      it('returns empty array for location with no courts', async () => {
        const location = await LocationFactory.create(pool)

        const courts = await courtRepo.findByLocation(location.id)

        expect(courts).toEqual([])
      })

      it('returns courts in creation order', async () => {
        const location = await LocationFactory.create(pool)
        const court1 = await CourtFactory.create(pool, location.id)
        const court2 = await CourtFactory.create(pool, location.id)

        const courts = await courtRepo.findByLocation(location.id)

        const ids = courts.map((c: any) => c.id)
        const idx1 = ids.indexOf(court1.id)
        const idx2 = ids.indexOf(court2.id)
        expect(idx1).toBeLessThan(idx2)
      })
    })

    describe('updateStatus', () => {
      it('updates court status to unavailable', async () => {
        const location = await LocationFactory.create(pool)
        const court = await CourtFactory.create(pool, location.id, { status: 'available' })

        const updated = await courtRepo.updateStatus(court.id, 'unavailable')

        expect(updated.status).toBe('unavailable')
        expect(updated.updated_at).not.toBe(court.updated_at)
      })

      it('updates court status to maintenance', async () => {
        const location = await LocationFactory.create(pool)
        const court = await CourtFactory.create(pool, location.id)

        const updated = await courtRepo.updateStatus(court.id, 'maintenance')

        expect(updated.status).toBe('maintenance')
      })

      it('rejects invalid status', async () => {
        const location = await LocationFactory.create(pool)
        const court = await CourtFactory.create(pool, location.id)

        await expect(
          courtRepo.updateStatus(court.id, 'invalid' as any)
        ).rejects.toThrow(CheckConstraintError)
      })

      it('throws NotFoundError for non-existent court', async () => {
        await expect(
          courtRepo.updateStatus('court_nonexistent', 'available')
        ).rejects.toThrow(NotFoundError)
      })
    })

    describe('countByLocation', () => {
      it('counts courts for a location', async () => {
        const location = await LocationFactory.create(pool)
        await CourtFactory.createMany(pool, location.id, 3)

        const count = await courtRepo.countByLocation(location.id)

        expect(count).toBe(3)
      })

      it('returns 0 for location with no courts', async () => {
        const location = await LocationFactory.create(pool)

        const count = await courtRepo.countByLocation(location.id)

        expect(count).toBe(0)
      })
    })

    describe('countByLocationAndStatus', () => {
      it('counts courts by location and status', async () => {
        const location = await LocationFactory.create(pool)
        await CourtFactory.createMany(pool, location.id, 2, 'available')
        await CourtFactory.createMany(pool, location.id, 1, 'unavailable')

        const availableCount = await courtRepo.countByLocationAndStatus(location.id, 'available')
        const unavailableCount = await courtRepo.countByLocationAndStatus(location.id, 'unavailable')

        expect(availableCount).toBe(2)
        expect(unavailableCount).toBe(1)
      })

      it('returns 0 for no courts with specified status', async () => {
        const location = await LocationFactory.create(pool)
        await CourtFactory.createMany(pool, location.id, 2, 'available')

        const count = await courtRepo.countByLocationAndStatus(location.id, 'maintenance')

        expect(count).toBe(0)
      })
    })
  })

  describe('Locations and Courts Integration', () => {
    it('creates location with multiple courts and calculates capacity', async () => {
      const location = await LocationFactory.create(pool, { totalCourts: 6 })
      const court1 = await CourtFactory.create(pool, location.id, { status: 'available' })
      const court2 = await CourtFactory.create(pool, location.id, { status: 'available' })
      const court3 = await CourtFactory.create(pool, location.id, { status: 'maintenance' })

      const capacity = await locationRepo.calculateCapacity(location.id)
      const totalCount = await courtRepo.countByLocation(location.id)
      const availableCount = await courtRepo.countByLocationAndStatus(location.id, 'available')

      expect(totalCount).toBe(3)
      expect(availableCount).toBe(2)
      expect(capacity).toBe(5) // 6 total - 1 unavailable (maintenance court)
    })

    it('handles soft-deleted location with existing courts', async () => {
      const location = await LocationFactory.create(pool)
      await CourtFactory.createMany(pool, location.id, 2)

      await locationRepo.softDelete(location.id)

      const deletedLocation = await locationRepo.findById(location.id)
      expect(deletedLocation).toBeUndefined()

      // Courts still exist even if location is deleted
      const courts = await courtRepo.findByLocation(location.id)
      expect(courts.length).toBe(2)
    })
  })
})
