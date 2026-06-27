import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../../helpers/db'
import { PlayerRepository } from '../../../db'
import { defaultAdultAttestation } from '../../factories/player.factory'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('PlayerRepository email normalization', () => {
  let pool: Pool
  let client: PoolClient
  let repo: PlayerRepository

  beforeAll(async () => {
    pool = await getTestPool()
    client = await beginTransaction(pool)
    repo = new PlayerRepository(client)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('findOrCreatePlayerByEmail dedups across email casing (one player_id)', async () => {
    const local = `Case.Test.${uid()}`
    const mixed = `${local}@Example.COM`
    const lower = `${local}@example.com`.toLowerCase()

    const first = await repo.findOrCreatePlayerByEmail(mixed, 'First', undefined, undefined, defaultAdultAttestation())
    const second = await repo.findOrCreatePlayerByEmail(lower.toUpperCase(), 'Second', undefined, undefined, defaultAdultAttestation())

    // Same person regardless of casing — must resolve to the same row
    expect(second.id).toBe(first.id)
    // Stored email is normalized to lowercase
    expect(first.email).toBe(lower)
  })

  it('findByEmail matches case-insensitively', async () => {
    const local = `Find.Me.${uid()}`
    const created = await repo.findOrCreatePlayerByEmail(`${local}@Example.com`, 'Finder', undefined, undefined, defaultAdultAttestation())

    const byUpper = await repo.findByEmail(`${local}@EXAMPLE.COM`.toUpperCase())
    const byLower = await repo.findByEmail(`${local}@example.com`.toLowerCase())

    expect(byUpper?.id).toBe(created.id)
    expect(byLower?.id).toBe(created.id)
  })
})
