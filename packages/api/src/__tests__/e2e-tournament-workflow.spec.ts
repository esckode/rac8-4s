import request from 'supertest'
import http from 'node:http'
import type { Express } from 'express'
import Database from 'better-sqlite3'
import { AddressInfo } from 'node:net'
import { createApp } from '../app'
import { openDatabase, TournamentRepository, PlayerRepository, GroupRepository, KnockoutRepository } from '../db'
import { InMemoryTokenStore } from '../auth/token-store'
import { InMemoryJobQueue } from '@worker/job-queue'
import { BroadcastBus } from '../broadcast-bus'
import { InMemoryEmailAdapter } from '../email-adapter'
import { issueOrganizerToken } from '../auth/tokens'
import { processStandingsRecalculate } from '../workers/standings-processor'
import { processBracketGenerate } from '../workers/bracket-processor'
import { processEmailSend } from '../workers/email-processor'
import { DEFAULT_APP_CONFIG } from '../config'

const STANDARD_CONFIG = { secret: 'test-secret', expiresInSeconds: 3600 }
const ORGANIZER_ID = 'org_test'

let db: Database.Database
let app: Express
let server: http.Server
let tokenStore: InMemoryTokenStore
let jobQueue: InMemoryJobQueue
let broadcastBus: BroadcastBus
let emailAdapter: InMemoryEmailAdapter
let tournamentRepo: TournamentRepository
let playerRepo: PlayerRepository
let groupRepo: GroupRepository
let organizerToken: string

async function registerPlayer(tournamentId: string, email: string, name: string) {
  const reg = await request(app)
    .post(`/tournaments/${tournamentId}/register`)
    .send({ email, name })

  expect([201, 202]).toContain(reg.status)
  expect(reg.body.magicLinkToken).toBeDefined()

  const verify = await request(app)
    .get(`/tournaments/${tournamentId}/auth/verify?token=${reg.body.magicLinkToken}`)

  expect(verify.status).toBe(200)
  return { token: verify.body.playerToken, playerId: verify.body.playerId }
}

function connectSSE(server: http.Server, tournamentId: string, token: string) {
  return new Promise<{ chunks: string[]; req: http.ClientRequest }>((resolve) => {
    const port = (server.address() as AddressInfo).port
    const chunks: string[] = []
    const req = http.get(
      { port, path: `/tournaments/${tournamentId}/events`, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        res.on('data', (c: Buffer) => chunks.push(c.toString()))
        resolve({ chunks, req })
      }
    )
  })
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeEach(async () => {
  db = openDatabase(':memory:')
  tokenStore = new InMemoryTokenStore()
  jobQueue = new InMemoryJobQueue()
  broadcastBus = new BroadcastBus()
  emailAdapter = new InMemoryEmailAdapter()

  app = createApp({
    config: DEFAULT_APP_CONFIG,
    db,
    jwtConfig: STANDARD_CONFIG,
    tokenStore,
    jobQueue,
    broadcastBus,
  })

  server = await new Promise<http.Server>(resolve => {
    const s = app.listen(0, () => resolve(s))
  })

  tournamentRepo = new TournamentRepository(db)
  playerRepo = new PlayerRepository(db)
  groupRepo = new GroupRepository(db)

  const tokenPair = issueOrganizerToken(
    { sub: ORGANIZER_ID, email: 'organizer@test.com' },
    STANDARD_CONFIG
  )
  organizerToken = tokenPair.accessToken
})

afterEach(async () => {
  await new Promise<void>(resolve => {
    server.close(() => resolve())
  })
  await jobQueue.close()
})

describe('Full Tournament Lifecycle', () => {
  it('completes a tournament from creation to final results', async () => {
    // Step 1: Create tournament (starts in draft status)
    const now = new Date()
    const regDeadline = new Date(now.getTime() + 3600000).toISOString() // 1 hour
    const groupDeadline = new Date(now.getTime() + 7200000).toISOString() // 2 hours
    const koDeadline = new Date(now.getTime() + 10800000).toISOString() // 3 hours

    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `E2E Test Tournament ${Date.now()}`,
        sport: 'pickleball',
        matchFormat: 'doubles',
        maxPlayers: 4,
        registrationDeadline: regDeadline,
        groupStageDeadline: groupDeadline,
        knockoutStageDeadline: koDeadline,
      })

    expect(createRes.status).toBe(201)
    const tournamentId = createRes.body.id
    expect(createRes.body.status).toBe('draft')

    // Step 2: Open registration (bypass draft → registration_open)
    const updated = tournamentRepo.updateStatus(tournamentId, 'registration_open')
    expect(updated.status).toBe('registration_open')

    // Step 3: Register 4 players
    const player1 = await registerPlayer(tournamentId, 'player1@test.com', 'Player 1')
    const player2 = await registerPlayer(tournamentId, 'player2@test.com', 'Player 2')
    const player3 = await registerPlayer(tournamentId, 'player3@test.com', 'Player 3')
    const player4 = await registerPlayer(tournamentId, 'player4@test.com', 'Player 4')

    // Step 4: Close registration
    const advanceRes1 = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    expect(advanceRes1.status).toBe(200)

    // Step 5: Create groups (direct repo, no HTTP endpoint)
    groupRepo.createGroups(tournamentId, 1, 2, [
      player1.playerId,
      player2.playerId,
      player3.playerId,
      player4.playerId,
    ])

    // Step 6: Start group stage
    const advanceRes2 = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    expect(advanceRes2.status).toBe(200)

    // Get group and matches
    const groupRes = await request(app)
      .get(`/tournaments/${tournamentId}/groups`)
      .set('Authorization', `Bearer ${organizerToken}`)

    expect(groupRes.status).toBe(200)
    const groupId = groupRes.body[0].id

    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    expect(matchesRes.status).toBe(200)
    const matches = matchesRes.body
    expect(matches.length).toBeGreaterThan(0) // Should have round-robin matches

    // Step 7: Submit all group scores (all matches)
    for (const match of matches) {
      const scoreRes = await request(app)
        .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1.token}`)
        .send({ score1: 2, score2: 1 })

      expect(scoreRes.status).toBe(200)
    }

    // Step 8: Verify standings job enqueued
    const allJobs = jobQueue.getAll()
    const standingsJob = allJobs.find(j => j.name === 'standings.recalculate')
    expect(standingsJob).toBeDefined()

    // Step 9: Run standings job manually
    expect(standingsJob).toBeDefined()
    if (standingsJob) {
      await processStandingsRecalculate(standingsJob.data as { tournamentId: string; groupId: string }, { groupRepo, broadcastBus })
    }

    // Step 10: Verify standings
    const standingsRes = await request(app)
      .get(`/tournaments/${tournamentId}/groups/${groupId}/standings`)
      .set('Authorization', `Bearer ${organizerToken}`)

    expect(standingsRes.status).toBe(200)
    expect(standingsRes.body.length).toBeGreaterThan(0)
    expect(standingsRes.body[0]).toHaveProperty('rank')

    // Step 11: Complete group stage
    const advanceRes3 = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'COMPLETE_GROUP_STAGE' })

    expect(advanceRes3.status).toBe(200)

    // Step 12: Generate bracket
    const genBracketRes = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizerToken}`)

    expect(genBracketRes.status).toBe(200)

    // Step 13: Run bracket job manually
    const bracketJob = jobQueue.getAll().find(j => j.name === 'bracket.generate')
    expect(bracketJob).toBeDefined()
    if (bracketJob) {
      const knockoutRepo = new KnockoutRepository(db)
      await processBracketGenerate(bracketJob.data as { tournamentId: string }, { knockoutRepo, groupRepo, broadcastBus })
    }

    // Step 14: Start knockout
    const advanceRes4 = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_KNOCKOUT' })

    expect(advanceRes4.status).toBe(200)

    // Step 15: Publish bracket
    const pubBracketRes = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)

    expect(pubBracketRes.status).toBe(200)

    // Step 16: Complete tournament
    const advanceRes5 = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'COMPLETE_TOURNAMENT' })

    expect(advanceRes5.status).toBe(200)
  })
})

describe('Real-Time SSE Events', () => {
  it('delivers standings.updated event after score submission', async () => {
    // Setup: Create tournament and register players
    const timestamp = Date.now()
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `SSE Test Tournament ${Date.now()}`,
        sport: 'pickleball',
        matchFormat: 'doubles',
        maxPlayers: 4,
        registrationDeadline: new Date(Date.now() + 3600000).toISOString(),
        groupStageDeadline: new Date(Date.now() + 7200000).toISOString(),
        knockoutStageDeadline: new Date(Date.now() + 10800000).toISOString(),
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const player1 = await registerPlayer(tournamentId, 'sse_player1@test.com', 'SSE Player 1')
    const player2 = await registerPlayer(tournamentId, 'sse_player2@test.com', 'SSE Player 2')
    const player3 = await registerPlayer(tournamentId, 'sse_player3@test.com', 'SSE Player 3')
    const player4 = await registerPlayer(tournamentId, 'sse_player4@test.com', 'SSE Player 4')

    // Advance tournament to group stage
    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    groupRepo.createGroups(tournamentId, 1, 2, [
      player1.playerId,
      player2.playerId,
      player3.playerId,
      player4.playerId,
    ])

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    // Open SSE connection
    const { chunks, req } = await connectSSE(server, tournamentId, player1.token)

    // Get matches and submit score
    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    const matches = matchesRes.body
    const firstMatch = matches[0]

    await request(app)
      .post(`/tournaments/${tournamentId}/matches/${firstMatch.id}/score`)
      .set('Authorization', `Bearer ${player1.token}`)
      .send({ score1: 2, score2: 1 })

    // Run standings job to trigger SSE event
    const standingsJob = jobQueue.getAll().find(j => j.name === 'standings.recalculate')
    expect(standingsJob).toBeDefined()
    if (standingsJob) {
      await processStandingsRecalculate(standingsJob.data as { tournamentId: string; groupId: string }, { groupRepo, broadcastBus })
    }

    // Wait for SSE chunk propagation
    await delay(50)

    // Verify event received
    const eventData = chunks.join('')
    expect(eventData).toContain('event: standings.updated')
    expect(eventData).toContain('groupId')
    expect(eventData).toContain('standings')

    // Cleanup
    req.destroy()
  })

  it('delivers bracket.published event after bracket publish', async () => {
    // Setup: Create tournament and reach group_stage_complete
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Bracket SSE Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const player1 = await registerPlayer(tournamentId, 'bracket_sse1@test.com', 'Bracket SSE 1')
    const player2 = await registerPlayer(tournamentId, 'bracket_sse2@test.com', 'Bracket SSE 2')
    const player3 = await registerPlayer(tournamentId, 'bracket_sse3@test.com', 'Bracket SSE 3')
    const player4 = await registerPlayer(tournamentId, 'bracket_sse4@test.com', 'Bracket SSE 4')

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    groupRepo.createGroups(tournamentId, 1, 2, [
      player1.playerId,
      player2.playerId,
      player3.playerId,
      player4.playerId,
    ])

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    // Submit all scores
    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    for (const match of matchesRes.body) {
      await request(app)
        .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1.token}`)
        .send({ score1: 2, score2: 1 })
    }

    // Run standings job
    const standingsJob = jobQueue.getAll().find(j => j.name === 'standings.recalculate')
    if (standingsJob) {
      await processStandingsRecalculate(standingsJob.data as { tournamentId: string; groupId: string }, { groupRepo, broadcastBus })
    }

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'COMPLETE_GROUP_STAGE' })

    // Generate bracket
    await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizerToken}`)

    const bracketJob = jobQueue.getAll().find(j => j.name === 'bracket.generate')
    if (bracketJob) {
      const knockoutRepo = new KnockoutRepository(db)
      await processBracketGenerate(bracketJob.data as { tournamentId: string }, { knockoutRepo, groupRepo, broadcastBus })
    }

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_KNOCKOUT' })

    // Open SSE before publishing
    const { chunks, req } = await connectSSE(server, tournamentId, player1.token)

    // Publish bracket
    await request(app)
      .post(`/tournaments/${tournamentId}/bracket/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)

    // Wait for SSE chunk propagation
    await delay(50)

    // Verify event received
    const eventData = chunks.join('')
    expect(eventData).toContain('event: bracket.published')

    // Cleanup
    req.destroy()
  })
})

describe('Email Notifications', () => {
  it('sends registration_confirmation email after player registers', async () => {
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Email Test Tournament ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const playerEmail = 'email_test@test.com'
    const playerName = 'Email Test Player'

    await registerPlayer(tournamentId, playerEmail, playerName)

    // Find and run email job
    const emailJob = jobQueue.getAll().find(j => j.name === 'email.send')
    expect(emailJob).toBeDefined()

    if (emailJob) {
      await processEmailSend(emailJob.data as { type: string; recipientIds: string[]; data: Record<string, unknown> }, { playerRepo, emailAdapter })
    }

    // Verify email sent
    expect(emailAdapter.sent.length).toBeGreaterThan(0)
    const sentEmail = emailAdapter.sent[0]
    expect(sentEmail.to).toBe(playerEmail)
    expect(sentEmail.subject).toBeDefined()
  })

  it('sends bracket_published email when bracket is published', async () => {
    // Full tournament setup
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Bracket Email Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const player1 = await registerPlayer(tournamentId, 'bracket_email1@test.com', 'Bracket Email 1')
    const player2 = await registerPlayer(tournamentId, 'bracket_email2@test.com', 'Bracket Email 2')
    const player3 = await registerPlayer(tournamentId, 'bracket_email3@test.com', 'Bracket Email 3')
    const player4 = await registerPlayer(tournamentId, 'bracket_email4@test.com', 'Bracket Email 4')

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    groupRepo.createGroups(tournamentId, 1, 2, [
      player1.playerId,
      player2.playerId,
      player3.playerId,
      player4.playerId,
    ])

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    for (const match of matchesRes.body) {
      await request(app)
        .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
        .set('Authorization', `Bearer ${player1.token}`)
        .send({ score1: 2, score2: 1 })
    }

    const standingsJob = jobQueue.getAll().find(j => j.name === 'standings.recalculate')
    if (standingsJob) {
      await processStandingsRecalculate(standingsJob.data as { tournamentId: string; groupId: string }, { groupRepo, broadcastBus })
    }

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'COMPLETE_GROUP_STAGE' })

    await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizerToken}`)

    const bracketJob = jobQueue.getAll().find(j => j.name === 'bracket.generate')
    if (bracketJob) {
      const knockoutRepo = new KnockoutRepository(db)
      await processBracketGenerate(bracketJob.data as { tournamentId: string }, { knockoutRepo, groupRepo, broadcastBus })
    }

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_KNOCKOUT' })

    // Clear previous emails before publishing
    emailAdapter.sent = []

    // Publish bracket
    await request(app)
      .post(`/tournaments/${tournamentId}/bracket/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)

    // Find and run email job for bracket published
    const bracketEmailJob = jobQueue.getAll().find(j => j.name === 'email.send')
    if (bracketEmailJob) {
      await processEmailSend(bracketEmailJob.data as { type: string; recipientIds: string[]; data: Record<string, unknown> }, { playerRepo, emailAdapter })
    }

    // Verify emails sent to players
    expect(emailAdapter.sent.length).toBeGreaterThan(0)
  })
})

describe('Error Scenarios', () => {
  it('rejects score submission after group stage deadline', async () => {
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Deadline Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 2,
        groupStageDeadline: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const player1 = await registerPlayer(tournamentId, 'deadline1@test.com', 'Deadline 1')
    const player2 = await registerPlayer(tournamentId, 'deadline2@test.com', 'Deadline 2')

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    groupRepo.createGroups(tournamentId, 1, 1, [
      player1.playerId,
      player2.playerId,
    ])

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    const match = matchesRes.body[0]

    const scoreRes = await request(app)
      .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${player1.token}`)
      .send({ score1: 2, score2: 1 })

    expect([400, 403]).toContain(scoreRes.status)
  })

  it('rejects score submission from non-participant player', async () => {
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Non-Participant Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const player1 = await registerPlayer(tournamentId, 'nonpart1@test.com', 'NonPart 1')
    const player2 = await registerPlayer(tournamentId, 'nonpart2@test.com', 'NonPart 2')
    const player3 = await registerPlayer(tournamentId, 'nonpart3@test.com', 'NonPart 3')
    const player4 = await registerPlayer(tournamentId, 'nonpart4@test.com', 'NonPart 4')

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    groupRepo.createGroups(tournamentId, 1, 2, [
      player1.playerId,
      player2.playerId,
      player3.playerId,
      player4.playerId,
    ])

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    const match = matchesRes.body[0]

    // Player 3 tries to submit score for a match they're not in
    const scoreRes = await request(app)
      .post(`/tournaments/${tournamentId}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${player3.token}`)
      .send({ score1: 2, score2: 1 })

    expect(scoreRes.status).toBe(403)
  })

  it('rejects bracket generation before all group scores submitted', async () => {
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Incomplete Scores Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const player1 = await registerPlayer(tournamentId, 'incomplete1@test.com', 'Incomplete 1')
    const player2 = await registerPlayer(tournamentId, 'incomplete2@test.com', 'Incomplete 2')
    const player3 = await registerPlayer(tournamentId, 'incomplete3@test.com', 'Incomplete 3')
    const player4 = await registerPlayer(tournamentId, 'incomplete4@test.com', 'Incomplete 4')

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'CLOSE_REGISTRATION' })

    groupRepo.createGroups(tournamentId, 1, 2, [
      player1.playerId,
      player2.playerId,
      player3.playerId,
      player4.playerId,
    ])

    await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'START_GROUP_STAGE' })

    // Only submit 1 score out of 6
    const matchesRes = await request(app)
      .get(`/tournaments/${tournamentId}/matches`)
      .set('Authorization', `Bearer ${organizerToken}`)

    await request(app)
      .post(`/tournaments/${tournamentId}/matches/${matchesRes.body[0].id}/score`)
      .set('Authorization', `Bearer ${player1.token}`)
      .send({ score1: 2, score2: 1 })

    // Try to generate bracket with incomplete scores
    const genRes = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${organizerToken}`)

    expect([400, 409]).toContain(genRes.status)
  })

  it('rejects invalid state transitions', async () => {
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Invalid State Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id
    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    // Try to transition directly from registration_open to COMPLETE_TOURNAMENT
    const advanceRes = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ action: 'COMPLETE_TOURNAMENT' })

    expect([400, 409]).toContain(advanceRes.status)
  })

  it('returns 401 for protected endpoints without token', async () => {
    const createRes = await request(app)
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Auth Test ${Date.now()}`,
        format: 'double_elimination',
        maxPlayers: 4,
      })

    const tournamentId = createRes.body.id

    // Try to advance without token
    const advanceRes = await request(app)
      .post(`/tournaments/${tournamentId}/advance`)
      .send({ action: 'CLOSE_REGISTRATION' })

    expect(advanceRes.status).toBe(401)

    // Try to submit score without token
    const scoreRes = await request(app)
      .post(`/tournaments/${tournamentId}/matches/match_123/score`)
      .send({ score1: 2, score2: 1 })

    expect(scoreRes.status).toBe(401)
  })
})
