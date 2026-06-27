/**
 * Integration tests: 18+ age gate across all three player-creation entry paths.
 *
 * Entry paths tested:
 *   1. Public tournament registration — POST /tournaments/:id/register
 *   2. Account signup — POST /api/auth/signup
 *   3. Group-invite accept (stub) — the findOrCreatePlayerByEmail boundary
 *
 * These tests confirm the gate is enforced at the universal player boundary
 * (findOrCreatePlayerByEmail in db.ts), not just at the specific routes.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool, PoolClient } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { PlayerRepository, TournamentRepository, AgeAttestation } from '../../db'
import { TournamentFactory, OrganizerFactory } from '../factories'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

function email(prefix = ''): string {
  return `age-gate-${prefix}-${uid()}@test.local`.toLowerCase()
}

function adultDob(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 25)
  return { dateOfBirth: d.toISOString().slice(0, 10), policyVersion: 'v1' }
}

function minorDob(): AgeAttestation {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 15)
  return { dateOfBirth: d.toISOString().slice(0, 10), policyVersion: 'v1' }
}

describe('age gate: entry path 1 — public tournament registration', () => {
  let pool: Pool
  let app: Express
  let tournamentId: string

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app

    const organizerId = OrganizerFactory.id()
    const tournament = await TournamentFactory.open(pool, organizerId)
    tournamentId = tournament!.id
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('blocks registration with no dob_attestation (status 400)', async () => {
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({ email: email('noreg'), name: 'No Attest' })

    expect(res.status).toBe(400)
    expect(res.body.code).toMatch(/AGE_ATTESTATION_REQUIRED|VALIDATION_ERROR/)
  })

  it('blocks registration of a minor (status 422)', async () => {
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({
        email: email('minor'),
        name: 'Minor Player',
        dob_attestation: minorDob(),
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('UNDER_AGE')
  })

  it('allows registration with a valid 18+ attestation (status 202)', async () => {
    const res = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({
        email: email('adult'),
        name: 'Adult Player',
        dob_attestation: adultDob(),
      })

    expect(res.status).toBe(202)
  })

  it('allows re-registration of an existing player without attestation', async () => {
    const playerEmail = email('existing')
    // First register (with attestation)
    const first = await request(app)
      .post(`/tournaments/${tournamentId}/register`)
      .send({
        email: playerEmail,
        name: 'Existing Adult',
        dob_attestation: adultDob(),
      })
    expect(first.status).toBe(202)

    // Second tournament (existing player can register without re-attesting)
    const organizerId2 = OrganizerFactory.id()
    const tournament2 = await TournamentFactory.open(pool, organizerId2)
    const second = await request(app)
      .post(`/tournaments/${tournament2!.id}/register`)
      .send({ email: playerEmail, name: 'Existing Adult' })

    expect(second.status).toBe(202)
  })
})

describe('age gate: entry path 2 — account signup', () => {
  let pool: Pool
  let app: Express

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('blocks signup with no dob_attestation (status 400)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: email('no-attest'), name: 'No Attest', password: 'password123' })

    expect(res.status).toBe(400)
    expect(res.body.code).toMatch(/AGE_ATTESTATION_REQUIRED|VALIDATION_ERROR/)
  })

  it('blocks signup of a minor (status 422)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email: email('minor'),
        name: 'Minor Signup',
        password: 'password123',
        dob_attestation: minorDob(),
      })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('UNDER_AGE')
  })

  it('allows signup with a valid 18+ attestation (status 201)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email: email('adult'),
        name: 'Adult Signup',
        password: 'password123',
        dob_attestation: adultDob(),
      })

    expect(res.status).toBe(201)
    expect(res.body.user.playerId).toBeTruthy()
  })

  it('allows signup when the email matches an existing player (no re-attestation needed)', async () => {
    // Create guest player first via tournament registration path (if we had one)
    // or directly via repository with attestation
    const playerRepo = new PlayerRepository(pool)
    const playerEmail = email('existing-guest')
    await playerRepo.findOrCreatePlayerByEmail(playerEmail, 'Guest', undefined, undefined, adultDob())

    // Signup claiming that existing player — no attestation needed (find path)
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email: playerEmail,
        name: 'Account Claiming Guest',
        password: 'password123',
        // No dob_attestation — existing player should be found, not created
      })

    expect(res.status).toBe(201)
  })
})

describe('age gate: entry path 3 — group-invite accept (stub boundary)', () => {
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

  it('blocks new player creation without attestation at the repository boundary', async () => {
    const e = email('invite-no-attest')
    await expect(
      repo.findOrCreatePlayerByEmail(e, 'Invitee', undefined, undefined, null)
    ).rejects.toThrow(/age attestation required/i)

    const found = await repo.findByEmail(e)
    expect(found).toBeUndefined()
  })

  it('blocks a minor invitee and writes no row', async () => {
    const e = email('invite-minor')
    await expect(
      repo.findOrCreatePlayerByEmail(e, 'MinorInvitee', undefined, undefined, minorDob())
    ).rejects.toThrow(/under 18|must be 18|age requirement/i)

    const found = await repo.findByEmail(e)
    expect(found).toBeUndefined()
  })

  it('creates the player for an adult invitee', async () => {
    const e = email('invite-adult')
    const player = await repo.findOrCreatePlayerByEmail(e, 'AdultInvitee', undefined, undefined, adultDob())
    expect(player.is_adult).toBe(true)
    expect(player.age_attested_at).toBeTruthy()
    expect(player.policy_version).toBe('v1')
  })
})
