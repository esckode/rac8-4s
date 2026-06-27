/**
 * Unit tests for the 18+ age gate at the universal player boundary.
 *
 * These tests are LEGALLY LOAD-BEARING — the gate must:
 *   1. Reject creation with no attestation
 *   2. Reject creation with an under-18 DOB (no row written)
 *   3. Accept creation with a valid 18+ DOB
 *   4. NEVER persist the raw DOB — only derived is_adult + age_attested_at + policy_version
 *   5. Always allow finding an existing player (gate is creation-only)
 */
import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, AgeAttestation } from '../../db'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function email(): string {
  return `age-gate-unit-${uid()}@test.local`
}

/** An adult attestation: 30-year-old today. */
function adultDob(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 30)
  return {
    dateOfBirth: d.toISOString().slice(0, 10), // YYYY-MM-DD
    policyVersion: 'v1',
  }
}

/** An under-18 attestation: 10-year-old today. */
function minorDob(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return {
    dateOfBirth: d.toISOString().slice(0, 10),
    policyVersion: 'v1',
  }
}

/** Exactly 18 today: should be accepted. */
function exactlyEighteenDob(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return {
    dateOfBirth: d.toISOString().slice(0, 10),
    policyVersion: 'v1',
  }
}

/** One day short of 18: should be rejected. */
function oneDayShortOf18Dob(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  d.setDate(d.getDate() + 1) // one day in the future = not yet 18
  return {
    dateOfBirth: d.toISOString().slice(0, 10),
    policyVersion: 'v1',
  }
}

describe('age gate: findOrCreatePlayerByEmail — creation path', () => {
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

  // ── NEGATIVE: no attestation ──────────────────────────────────────────────

  it('rejects creation when no attestation is provided', async () => {
    await expect(
      repo.findOrCreatePlayerByEmail(email(), 'No Attest', undefined, undefined, null)
    ).rejects.toThrow(/age attestation required/i)
  })

  it('rejects creation when attestation is omitted (backward-compat call)', async () => {
    // The signature now requires the attestation; omitting it defaults to null
    // and must be rejected on the creation path.
    const e = email()
    await expect(
      repo.findOrCreatePlayerByEmail(e, 'Omit Attest')
    ).rejects.toThrow(/age attestation required/i)
  })

  // ── NEGATIVE: under-18 DOB ────────────────────────────────────────────────

  it('rejects an under-18 DOB with a hard error and writes no row', async () => {
    const e = email()
    await expect(
      repo.findOrCreatePlayerByEmail(e, 'Minor', undefined, undefined, minorDob())
    ).rejects.toThrow(/under 18|must be 18|age requirement/i)

    // Confirm: no row was written
    const found = await repo.findByEmail(e)
    expect(found).toBeUndefined()
  })

  it('rejects a DOB exactly one day short of 18', async () => {
    const e = email()
    await expect(
      repo.findOrCreatePlayerByEmail(e, 'AlmostAdult', undefined, undefined, oneDayShortOf18Dob())
    ).rejects.toThrow(/under 18|must be 18|age requirement/i)

    const found = await repo.findByEmail(e)
    expect(found).toBeUndefined()
  })

  // ── POSITIVE: valid 18+ DOB ───────────────────────────────────────────────

  it('creates a player when the attestation is a valid 18+ DOB', async () => {
    const e = email()
    const player = await repo.findOrCreatePlayerByEmail(e, 'Adult', undefined, undefined, adultDob())
    expect(player.id).toBeTruthy()
    expect(player.email).toBe(e)
    expect(player.is_adult).toBe(true)
    expect(player.age_attested_at).toBeTruthy()
    expect(player.policy_version).toBe('v1')
  })

  it('accepts a DOB of exactly 18 years ago today', async () => {
    const e = email()
    const player = await repo.findOrCreatePlayerByEmail(e, 'JustAdult', undefined, undefined, exactlyEighteenDob())
    expect(player.is_adult).toBe(true)
  })

  // ── DATA-MINIMIZATION: no raw DOB stored ─────────────────────────────────

  it('does NOT persist the raw date of birth on the player row', async () => {
    const e = email()
    const attestation = adultDob()
    const player = await repo.findOrCreatePlayerByEmail(e, 'AdultMin', undefined, undefined, attestation)

    // The returned row must have no dob / date_of_birth field
    expect((player as any).dob).toBeUndefined()
    expect((player as any).date_of_birth).toBeUndefined()

    // The DB row must also have no such column — query directly
    const result = await (pool as any).query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = $2',
      ['players', 'public']
    )
    const cols: string[] = result.rows.map((r: any) => r.column_name)
    expect(cols).not.toContain('dob')
    expect(cols).not.toContain('date_of_birth')

    // But derived fields ARE present
    expect(cols).toContain('is_adult')
    expect(cols).toContain('age_attested_at')
    expect(cols).toContain('policy_version')

    // And the raw DOB value is not stored anywhere in the attestation columns
    expect(player.age_attested_at).not.toContain(attestation.dateOfBirth)
  })

  // ── FIND path: existing player is NOT gated ───────────────────────────────

  it('returns an existing player without re-checking the attestation', async () => {
    const e = email()
    // Create with valid attestation
    const created = await repo.findOrCreatePlayerByEmail(e, 'ExistingAdult', undefined, undefined, adultDob())

    // Find without attestation — must succeed (find path, no gate)
    const found = await repo.findOrCreatePlayerByEmail(e, 'ExistingAdult', undefined, undefined, null)
    expect(found.id).toBe(created.id)
  })

  it('returns an existing player even when called without attestation arg', async () => {
    const e = email()
    await repo.findOrCreatePlayerByEmail(e, 'ExistingPlayer', undefined, undefined, adultDob())

    // Existing player — gate must not apply
    const found = await repo.findOrCreatePlayerByEmail(e, 'ExistingPlayer')
    expect(found.email).toBe(e)
  })
})
