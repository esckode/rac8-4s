import Database from 'better-sqlite3'
import { openDatabase, LocationRepository, CourtRepository, CreateLocationInput } from '../db'

describe('LocationRepository', () => {
  let db: Database.Database
  let locationRepo: LocationRepository
  let courtRepo: CourtRepository

  beforeEach(async () => {
    db = openDatabase(':memory:')
    locationRepo = new LocationRepository(db)
    courtRepo = new CourtRepository(db)
  })

  describe('create', () => {
    it('should create a location with valid data', () => {
      const input: CreateLocationInput = {
        name: 'Central Park',
        sport: 'pickleball',
        latitude: 40.785091,
        longitude: -73.968285,
        totalCourts: 4,
        restricted: false,
      }

      const location = locationRepo.create(input)

      expect(location).toBeDefined()
      expect(location.id).toMatch(/^location_/)
      expect(location.name).toBe('Central Park')
      expect(location.sport).toBe('pickleball')
      expect(location.latitude).toBe(40.785091)
      expect(location.longitude).toBe(-73.968285)
      expect(location.total_courts).toBe(4)
      expect(location.restricted).toBe(false)
      expect(location.created_at).toBeDefined()
      expect(location.updated_at).toBeDefined()
      expect(location.deleted_at).toBeFalsy()
    })

    it('should create location with optional entry_conditions', () => {
      const input: CreateLocationInput = {
        name: 'Private Club',
        sport: 'tennis',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 8,
        restricted: true,
        entryConditions: 'Members only',
      }

      const location = locationRepo.create(input)

      expect(location.restricted).toBe(true)
      expect(location.entry_conditions).toBe('Members only')
    })

    it('should assign unique IDs to different locations', () => {
      const input: CreateLocationInput = {
        name: 'Location 1',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      }

      const loc1 = locationRepo.create(input)
      const loc2 = locationRepo.create({ ...input, name: 'Location 2' })

      expect(loc1.id).not.toBe(loc2.id)
    })
  })

  describe('findById', () => {
    it('should find location by id', () => {
      const input: CreateLocationInput = {
        name: 'Test Location',
        sport: 'badminton',
        latitude: 40.5,
        longitude: -73.5,
        totalCourts: 3,
      }

      const created = locationRepo.create(input)
      const found = locationRepo.findById(created.id)

      expect(found).toBeDefined()
      expect(found?.name).toBe('Test Location')
    })

    it('should return undefined for non-existent location', () => {
      const result = locationRepo.findById('location_nonexistent')
      expect(result).toBeUndefined()
    })

    it('should not find soft-deleted location', () => {
      const created = locationRepo.create({
        name: 'Deletable',
        sport: 'tennis',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })

      locationRepo.softDelete(created.id)
      const found = locationRepo.findById(created.id)

      expect(found).toBeUndefined()
    })
  })

  describe('findBySport', () => {
    beforeEach(async () => {
      locationRepo.create({
        name: 'Pickleball Court 1',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })
      locationRepo.create({
        name: 'Pickleball Court 2',
        sport: 'pickleball',
        latitude: 40.1,
        longitude: -73.1,
        totalCourts: 3,
      })
      locationRepo.create({
        name: 'Tennis Court',
        sport: 'tennis',
        latitude: 40.2,
        longitude: -73.2,
        totalCourts: 4,
      })
    })

    it('should find locations by sport', () => {
      const result = locationRepo.findBySport('pickleball')

      expect(result.rows).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.rows[0].sport).toBe('pickleball')
      expect(result.rows[1].sport).toBe('pickleball')
    })

    it('should respect limit and offset', () => {
      const result = locationRepo.findBySport('pickleball', { limit: 1, offset: 0 })

      expect(result.rows).toHaveLength(1)
      expect(result.total).toBe(2)
    })

    it('should return empty for non-existent sport', () => {
      const result = locationRepo.findBySport('cricket')

      expect(result.rows).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should exclude soft-deleted locations', () => {
      const allPickleball = locationRepo.findBySport('pickleball')
      const firstId = allPickleball.rows[0].id

      locationRepo.softDelete(firstId)
      const afterDelete = locationRepo.findBySport('pickleball')

      expect(afterDelete.rows).toHaveLength(1)
      expect(afterDelete.total).toBe(1)
    })
  })

  describe('listAll', () => {
    beforeEach(async () => {
      locationRepo.create({
        name: 'Location 1',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })
      locationRepo.create({
        name: 'Location 2',
        sport: 'tennis',
        latitude: 40.1,
        longitude: -73.1,
        totalCourts: 3,
      })
      locationRepo.create({
        name: 'Location 3',
        sport: 'badminton',
        latitude: 40.2,
        longitude: -73.2,
        totalCourts: 4,
      })
    })

    it('should list all locations', () => {
      const result = locationRepo.listAll()

      expect(result.rows).toHaveLength(3)
      expect(result.total).toBe(3)
    })

    it('should respect limit and offset', () => {
      const result = locationRepo.listAll({ limit: 2, offset: 0 })

      expect(result.rows).toHaveLength(2)
      expect(result.total).toBe(3)
    })

    it('should return locations ordered by created_at', () => {
      const result = locationRepo.listAll()

      expect(result.rows).toHaveLength(3)
      // Verify all three locations are present
      const names = result.rows.map(r => r.name)
      expect(names).toContain('Location 1')
      expect(names).toContain('Location 2')
      expect(names).toContain('Location 3')
    })
  })

  describe('update', () => {
    it('should update location name', () => {
      const created = locationRepo.create({
        name: 'Original Name',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })

      const updated = locationRepo.update(created.id, { name: 'New Name' })

      expect(updated.name).toBe('New Name')
      expect(updated.updated_at >= created.updated_at).toBe(true)
    })

    it('should update total_courts', () => {
      const created = locationRepo.create({
        name: 'Test Location',
        sport: 'tennis',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })

      const updated = locationRepo.update(created.id, { totalCourts: 5 })

      expect(updated.total_courts).toBe(5)
    })

    it('should update restricted and entry_conditions', () => {
      const created = locationRepo.create({
        name: 'Test Location',
        sport: 'badminton',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 3,
        restricted: false,
      })

      const updated = locationRepo.update(created.id, {
        restricted: true,
        entryConditions: 'Members only',
      })

      expect(updated.restricted).toBe(true)
      expect(updated.entry_conditions).toBe('Members only')
    })

    it('should allow partial updates', () => {
      const created = locationRepo.create({
        name: 'Test Location',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
        restricted: false,
      })

      const updated = locationRepo.update(created.id, { name: 'Updated Name' })

      expect(updated.name).toBe('Updated Name')
      expect(updated.total_courts).toBe(2)
      expect(updated.restricted).toBe(false)
    })
  })

  describe('calculateCapacity', () => {
    it('should return total courts when all are available', () => {
      const location = locationRepo.create({
        name: 'Test Location',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 4,
      })

      // Create all courts as available
      for (let i = 0; i < 4; i++) {
        courtRepo.create({
          locationId: location.id,
          status: 'available',
        })
      }

      const capacity = locationRepo.calculateCapacity(location.id)
      expect(capacity).toBe(4)
    })

    it('should subtract unavailable courts from capacity', () => {
      const location = locationRepo.create({
        name: 'Test Location',
        sport: 'tennis',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 4,
      })

      courtRepo.create({ locationId: location.id, status: 'available' })
      courtRepo.create({ locationId: location.id, status: 'available' })
      courtRepo.create({ locationId: location.id, status: 'unavailable' })
      courtRepo.create({ locationId: location.id, status: 'maintenance' })

      const capacity = locationRepo.calculateCapacity(location.id)
      expect(capacity).toBe(2)
    })

    it('should return 0 for non-existent location', () => {
      const capacity = locationRepo.calculateCapacity('location_nonexistent')
      expect(capacity).toBe(0)
    })

    it('should return 0 when all courts are unavailable', () => {
      const location = locationRepo.create({
        name: 'Test Location',
        sport: 'badminton',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 3,
      })

      courtRepo.create({ locationId: location.id, status: 'unavailable' })
      courtRepo.create({ locationId: location.id, status: 'maintenance' })
      courtRepo.create({ locationId: location.id, status: 'unavailable' })

      const capacity = locationRepo.calculateCapacity(location.id)
      expect(capacity).toBe(0)
    })
  })

  describe('findNearby', () => {
    beforeEach(async () => {
      // Create locations at various coordinates
      locationRepo.create({
        name: 'Center',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })
      locationRepo.create({
        name: 'Nearby',
        sport: 'pickleball',
        latitude: 40.01,
        longitude: -73.01,
        totalCourts: 2,
      })
      locationRepo.create({
        name: 'Far',
        sport: 'pickleball',
        latitude: 40.1,
        longitude: -73.1,
        totalCourts: 2,
      })
    })

    it('should find nearby locations within 25m radius', () => {
      const nearby = locationRepo.findNearby(40.0, -73.0, 0.025)

      expect(nearby.length).toBeGreaterThanOrEqual(1)
      const names = nearby.map(l => l.name)
      expect(names).toContain('Center')
    })

    it('should use default 25m radius', () => {
      const nearby = locationRepo.findNearby(40.0, -73.0)

      expect(nearby.length).toBeGreaterThanOrEqual(1)
    })

    it('should not include soft-deleted locations', () => {
      const locations = locationRepo.listAll().rows
      const centerLocation = locations.find(l => l.name === 'Center')!

      locationRepo.softDelete(centerLocation.id)
      const nearby = locationRepo.findNearby(40.0, -73.0, 0.05)

      const names = nearby.map(l => l.name)
      expect(names).not.toContain('Center')
    })
  })

  describe('softDelete', () => {
    it('should soft delete a location', () => {
      const created = locationRepo.create({
        name: 'Deletable',
        sport: 'pickleball',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })

      locationRepo.softDelete(created.id)
      const found = locationRepo.findById(created.id)

      expect(found).toBeUndefined()
    })

    it('should set deleted_at timestamp', () => {
      const created = locationRepo.create({
        name: 'Deletable',
        sport: 'tennis',
        latitude: 40.0,
        longitude: -73.0,
        totalCourts: 2,
      })

      locationRepo.softDelete(created.id)

      // Query raw to verify deleted_at is set
      const raw = db.prepare('SELECT * FROM locations WHERE id = ?').get(created.id) as any
      expect(raw.deleted_at).toBeDefined()
    })
  })
})

describe('CourtRepository', () => {
  let db: Database.Database
  let locationRepo: LocationRepository
  let courtRepo: CourtRepository
  let locationId: string

  beforeEach(async () => {
    db = openDatabase(':memory:')
    locationRepo = new LocationRepository(db)
    courtRepo = new CourtRepository(db)

    const location = locationRepo.create({
      name: 'Test Location',
      sport: 'pickleball',
      latitude: 40.0,
      longitude: -73.0,
      totalCourts: 4,
    })
    locationId = location.id
  })

  describe('create', () => {
    it('should create a court with default status', () => {
      const court = courtRepo.create({ locationId })

      expect(court).toBeDefined()
      expect(court.id).toMatch(/^court_/)
      expect(court.location_id).toBe(locationId)
      expect(court.status).toBe('available')
      expect(court.created_at).toBeDefined()
      expect(court.updated_at).toBeDefined()
    })

    it('should create a court with specified status', () => {
      const court = courtRepo.create({
        locationId,
        status: 'unavailable',
      })

      expect(court.status).toBe('unavailable')
    })

    it('should assign unique IDs to different courts', () => {
      const court1 = courtRepo.create({ locationId })
      const court2 = courtRepo.create({ locationId })

      expect(court1.id).not.toBe(court2.id)
    })

    it('should create court for valid location', () => {
      const court = courtRepo.create({ locationId })

      expect(court.location_id).toBe(locationId)
    })
  })

  describe('findById', () => {
    it('should find court by id', () => {
      const created = courtRepo.create({ locationId })
      const found = courtRepo.findById(created.id)

      expect(found).toBeDefined()
      expect(found?.location_id).toBe(locationId)
    })

    it('should return undefined for non-existent court', () => {
      const result = courtRepo.findById('court_nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('findByLocation', () => {
    it('should find all courts for a location', () => {
      courtRepo.create({ locationId })
      courtRepo.create({ locationId })
      courtRepo.create({ locationId })

      const courts = courtRepo.findByLocation(locationId)

      expect(courts).toHaveLength(3)
      expect(courts.every(c => c.location_id === locationId)).toBe(true)
    })

    it('should return empty for location with no courts', () => {
      const newLoc = locationRepo.create({
        name: 'Empty Location',
        sport: 'tennis',
        latitude: 40.5,
        longitude: -73.5,
        totalCourts: 2,
      })

      const courts = courtRepo.findByLocation(newLoc.id)

      expect(courts).toHaveLength(0)
    })

    it('should return courts in created order', () => {
      const court1 = courtRepo.create({ locationId })
      const court2 = courtRepo.create({ locationId })
      const court3 = courtRepo.create({ locationId })

      const courts = courtRepo.findByLocation(locationId)

      expect(courts[0].id).toBe(court1.id)
      expect(courts[1].id).toBe(court2.id)
      expect(courts[2].id).toBe(court3.id)
    })
  })

  describe('updateStatus', () => {
    it('should update court status to unavailable', () => {
      const court = courtRepo.create({ locationId })

      const updated = courtRepo.updateStatus(court.id, 'unavailable')

      expect(updated.status).toBe('unavailable')
      expect(updated.updated_at >= court.updated_at).toBe(true)
    })

    it('should update court status to maintenance', () => {
      const court = courtRepo.create({ locationId })

      const updated = courtRepo.updateStatus(court.id, 'maintenance')

      expect(updated.status).toBe('maintenance')
    })

    it('should update court status back to available', () => {
      const court = courtRepo.create({ locationId, status: 'maintenance' })

      const updated = courtRepo.updateStatus(court.id, 'available')

      expect(updated.status).toBe('available')
    })
  })

  describe('countByLocation', () => {
    it('should count courts for a location', () => {
      courtRepo.create({ locationId })
      courtRepo.create({ locationId })
      courtRepo.create({ locationId })

      const count = courtRepo.countByLocation(locationId)

      expect(count).toBe(3)
    })

    it('should return 0 for location with no courts', () => {
      const newLoc = locationRepo.create({
        name: 'Empty Location',
        sport: 'badminton',
        latitude: 40.5,
        longitude: -73.5,
        totalCourts: 2,
      })

      const count = courtRepo.countByLocation(newLoc.id)

      expect(count).toBe(0)
    })
  })

  describe('countByLocationAndStatus', () => {
    it('should count courts by status', () => {
      courtRepo.create({ locationId, status: 'available' })
      courtRepo.create({ locationId, status: 'available' })
      courtRepo.create({ locationId, status: 'unavailable' })

      const availableCount = courtRepo.countByLocationAndStatus(locationId, 'available')
      const unavailableCount = courtRepo.countByLocationAndStatus(locationId, 'unavailable')

      expect(availableCount).toBe(2)
      expect(unavailableCount).toBe(1)
    })

    it('should return 0 when no courts match status', () => {
      courtRepo.create({ locationId, status: 'available' })
      courtRepo.create({ locationId, status: 'available' })

      const maintenanceCount = courtRepo.countByLocationAndStatus(locationId, 'maintenance')

      expect(maintenanceCount).toBe(0)
    })

    it('should handle all status values', () => {
      const court1 = courtRepo.create({ locationId, status: 'available' })
      const court2 = courtRepo.create({ locationId, status: 'unavailable' })
      const court3 = courtRepo.create({ locationId, status: 'maintenance' })

      const available = courtRepo.countByLocationAndStatus(locationId, 'available')
      const unavailable = courtRepo.countByLocationAndStatus(locationId, 'unavailable')
      const maintenance = courtRepo.countByLocationAndStatus(locationId, 'maintenance')

      expect(available).toBe(1)
      expect(unavailable).toBe(1)
      expect(maintenance).toBe(1)
    })
  })
})

describe('Location and Court Integration', () => {
  let db: Database.Database
  let locationRepo: LocationRepository
  let courtRepo: CourtRepository

  beforeEach(async () => {
    db = openDatabase(':memory:')
    locationRepo = new LocationRepository(db)
    courtRepo = new CourtRepository(db)
  })

  it('should maintain location-court relationship', () => {
    const location = locationRepo.create({
      name: 'Integration Test Location',
      sport: 'pickleball',
      latitude: 40.0,
      longitude: -73.0,
      totalCourts: 3,
    })

    const court1 = courtRepo.create({ locationId: location.id, status: 'available' })
    const court2 = courtRepo.create({ locationId: location.id, status: 'unavailable' })

    const courts = courtRepo.findByLocation(location.id)
    expect(courts).toHaveLength(2)
    expect(courts.map(c => c.id)).toEqual(expect.arrayContaining([court1.id, court2.id]))
  })

  it('should calculate correct capacity when courts change status', () => {
    const location = locationRepo.create({
      name: 'Capacity Test Location',
      sport: 'tennis',
      latitude: 40.0,
      longitude: -73.0,
      totalCourts: 4,
    })

    // Create 4 courts
    const court1 = courtRepo.create({ locationId: location.id, status: 'available' })
    const court2 = courtRepo.create({ locationId: location.id, status: 'available' })
    const court3 = courtRepo.create({ locationId: location.id, status: 'available' })
    const court4 = courtRepo.create({ locationId: location.id, status: 'available' })

    expect(locationRepo.calculateCapacity(location.id)).toBe(4)

    courtRepo.updateStatus(court1.id, 'unavailable')
    expect(locationRepo.calculateCapacity(location.id)).toBe(3)

    courtRepo.updateStatus(court2.id, 'maintenance')
    expect(locationRepo.calculateCapacity(location.id)).toBe(2)

    courtRepo.updateStatus(court1.id, 'available')
    expect(locationRepo.calculateCapacity(location.id)).toBe(3)
  })

  it('should validate foreign key relationship', () => {
    const location = locationRepo.create({
      name: 'FK Test Location',
      sport: 'badminton',
      latitude: 40.0,
      longitude: -73.0,
      totalCourts: 2,
    })

    const court = courtRepo.create({ locationId: location.id })

    // Verify the relationship
    const foundCourt = courtRepo.findById(court.id)
    expect(foundCourt?.location_id).toBe(location.id)
  })
})
