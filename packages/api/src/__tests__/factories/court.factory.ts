import { CourtRepository, CreateCourtInput } from '../../db'
import { DbConnection } from '../../db'

export interface CourtData extends CreateCourtInput {
  locationId: string
}

export const CourtFactory = {
  data(locationId: string, overrides: Partial<CourtData> = {}): CourtData {
    return {
      locationId,
      status: 'available',
      ...overrides,
    }
  },

  async create(pool: DbConnection, locationId: string, overrides: Partial<CourtData> = {}) {
    const repo = new CourtRepository(pool)
    return repo.create(this.data(locationId, overrides))
  },

  async createMany(pool: DbConnection, locationId: string, count: number, status: 'available' | 'unavailable' | 'maintenance' = 'available') {
    const repo = new CourtRepository(pool)
    const courts = []
    for (let i = 0; i < count; i++) {
      const court = await repo.create({ locationId, status })
      courts.push(court)
    }
    return courts
  },
}
