import crypto from 'crypto'
import { LocationRepository, CreateLocationInput } from '../../db'
import { DbConnection } from '../../db'

export interface LocationData extends CreateLocationInput {
  name: string
  sport: string
  latitude: number
  longitude: number
  totalCourts: number
}

export const LocationFactory = {
  uid(): string {
    return crypto.randomUUID().slice(0, 8)
  },

  data(overrides: Partial<LocationData> = {}): LocationData {
    const uid = this.uid()

    return {
      name: `test-location-${uid}`,
      sport: 'tennis',
      latitude: 40.7128 + Math.random() * 0.1,
      longitude: -74.006 + Math.random() * 0.1,
      totalCourts: 4,
      restricted: false,
      entryConditions: undefined,
      ...overrides,
    }
  },

  async create(pool: DbConnection, overrides: Partial<LocationData> = {}) {
    const repo = new LocationRepository(pool)
    return repo.create(this.data(overrides))
  },
}
