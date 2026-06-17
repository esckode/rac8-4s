/**
 * E2E Test Fixtures & Prerequisite Helpers
 *
 * Shared utilities for all e2e tests:
 * - API call helpers
 * - Auth state management
 * - Test data generators
 * - Tournament prerequisite setup
 *
 * Usage:
 *   import { apiCall, createTournamentWithOpenRegistration, ... } from './fixtures'
 */

import { API_CONFIG, API_ENDPOINTS } from './config'

// ============================================================================
// API Call Helpers
// ============================================================================

/**
 * Make authenticated/unauthenticated API calls
 *
 * Usage:
 *   const response = await apiCall('/tournaments', 'POST', body, token)
 *   if (!response.ok) throw new Error(`API failed: ${response.status}`)
 */
export async function apiCall(path: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${API_CONFIG.BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return response
}

// ============================================================================
// Browser State Helpers
// ============================================================================

/**
 * Get auth token from browser localStorage
 *
 * Usage:
 *   const token = await getTokenFromPage(page)
 *   expect(token).toBeTruthy()
 */
export async function getTokenFromPage(page: any): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem('auth_token'))
}

/**
 * Clear auth state and reload page
 *
 * Usage:
 *   await clearAuthState(page)
 */
export async function clearAuthState(page: any) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_token')
    sessionStorage.clear()
  })
  await page.reload()
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Create a unique test user
 *
 * Usage:
 *   const user = createTestUser()
 *   // { email: 'test-1234567890@example.com', name: 'Test User', password: 'TestPassword123' }
 */
let userCounter = 0
export function createTestUser() {
  const timestamp = Date.now()
  userCounter++
  // Include a random suffix: Playwright runs each browser project in its own worker
  // process, so timestamp + per-process counter can collide across parallel projects.
  const rand = Math.random().toString(36).slice(2, 8)
  return {
    email: `test-${timestamp}-${userCounter}-${rand}@example.com`,
    name: 'Test User',
    password: 'TestPassword123',
  }
}

/**
 * Create a unique tournament with default settings
 *
 * Usage:
 *   const tournament = createTestTournament()
 *   // { name: 'Test Tournament 1234567890', sport: 'pickleball', ... }
 */
export function createTestTournament() {
  const timestamp = Date.now()
  return {
    name: `Test Tournament ${timestamp}`,
    sport: 'pickleball',
    matchFormat: 'singles',
    maxPlayers: 16,
    registrationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    groupStageDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    knockoutStageDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

// ============================================================================
// Tournament Prerequisite Helpers
// ============================================================================
// These helpers set up the necessary tournament state for e2e tests.
// They should be called in test setup (not in individual test flows).

/**
 * PREREQUISITE: Create a tournament and open registration
 *
 * Handles the necessary state setup for tests that require registration_open status:
 * 1. Create tournament (starts in 'draft' state)
 * 2. Transition to 'registration_open' state
 *
 * Usage:
 *   const tournament = createTestTournament()
 *   const { id, name } = await createTournamentWithOpenRegistration(tournament, organizerToken)
 *
 * Why this is needed:
 *   - Tournaments are created in 'draft' status by default
 *   - Player registration requires 'registration_open' status
 *   - This helper encapsulates the state transition logic
 */
export async function createTournamentWithOpenRegistration(
  tournamentConfig: any,
  organizerToken: string
): Promise<{ id: string; name: string }> {
  // Step 1: Create tournament (starts in 'draft' state)
  const tournamentResponse = await apiCall(
    API_ENDPOINTS.TOURNAMENTS.CREATE,
    'POST',
    tournamentConfig,
    organizerToken
  )

  if (!tournamentResponse.ok) {
    const error = await tournamentResponse.text()
    throw new Error(`Failed to create tournament: ${tournamentResponse.status} ${error}`)
  }

  const tournamentData = await tournamentResponse.json()
  const tournamentId = tournamentData.id

  // Step 2: Transition tournament from 'draft' → 'registration_open'
  const advanceResponse = await apiCall(
    `/tournaments/${tournamentId}/advance`,
    'POST',
    { action: 'OPEN_REGISTRATION' },
    organizerToken
  )

  if (!advanceResponse.ok) {
    const error = await advanceResponse.text()
    throw new Error(`Failed to open registration: ${advanceResponse.status} ${error}`)
  }

  return { id: tournamentId, name: tournamentData.name }
}

/**
 * PREREQUISITE: Create a tournament, open registration, and close it
 *
 * Handles state setup for tests that need 'registration_closed' status:
 * 1. Create tournament (starts in 'draft')
 * 2. Open registration ('draft' → 'registration_open')
 * 3. Close registration ('registration_open' → 'registration_closed')
 *
 * Usage:
 *   const { id } = await createTournamentWithClosedRegistration(tournament, organizerToken)
 */
export async function createTournamentWithClosedRegistration(
  tournamentConfig: any,
  organizerToken: string
): Promise<{ id: string; name: string }> {
  // First, create tournament with open registration
  const { id: tournamentId, name } = await createTournamentWithOpenRegistration(
    tournamentConfig,
    organizerToken
  )

  // Then, close registration
  const closeResponse = await apiCall(
    `/tournaments/${tournamentId}/advance`,
    'POST',
    { action: 'CLOSE_REGISTRATION' },
    organizerToken
  )

  if (!closeResponse.ok) {
    const error = await closeResponse.text()
    throw new Error(`Failed to close registration: ${closeResponse.status} ${error}`)
  }

  return { id: tournamentId, name }
}

/**
 * PREREQUISITE: Create a tournament with groups (group stage active)
 *
 * Handles state setup for tests that need 'group_stage_active' status:
 * 1. Create tournament with open registration
 * 2. Register some players
 * 3. Close registration
 * 4. Create groups
 *
 * Supports both singles and doubles tournaments:
 * - Singles: Register playerCount individual players
 * - Doubles: Create playerCount/2 teams by pairing players
 *
 * Usage:
 *   const { tournamentId, groups } = await createTournamentWithGroups(tournament, organizerToken, playerCount)
 */
export async function createTournamentWithGroups(
  tournamentConfig: any,
  organizerToken: string,
  playerCount: number = 4
): Promise<{ id: string; name: string }> {
  // Create tournament with open registration
  const { id: tournamentId, name } = await createTournamentWithOpenRegistration(
    tournamentConfig,
    organizerToken
  )

  const isDoubles = tournamentConfig.matchFormat === 'doubles'

  if (isDoubles) {
    // For doubles: register individual players
    // The group creation endpoint will auto-create teams from these players
    for (let i = 0; i < playerCount; i++) {
      const user = createTestUser()
      const regResponse = await apiCall(
        `/tournaments/${tournamentId}/register`,
        'POST',
        { email: user.email, name: user.name }
      )

      if (!regResponse.ok) {
        const error = await regResponse.text()
        throw new Error(`Failed to register player: ${regResponse.status} ${error}`)
      }
    }
  } else {
    // For singles: register individual players
    for (let i = 0; i < playerCount; i++) {
      const user = createTestUser()
      const regResponse = await apiCall(
        `/tournaments/${tournamentId}/register`,
        'POST',
        { email: user.email, name: user.name }
      )

      if (!regResponse.ok) {
        const error = await regResponse.text()
        throw new Error(`Failed to register player: ${regResponse.status} ${error}`)
      }
    }
  }

  // Close registration
  const closeResponse = await apiCall(
    `/tournaments/${tournamentId}/advance`,
    'POST',
    { action: 'CLOSE_REGISTRATION' },
    organizerToken
  )

  if (!closeResponse.ok) {
    const error = await closeResponse.text()
    throw new Error(`Failed to close registration: ${closeResponse.status} ${error}`)
  }

  // Create groups - divide players into groups with top 1 advancing
  // For singles: ~2 players per group
  // For doubles: ~4 players (2 teams) per group
  const playersPerGroup = isDoubles ? 4 : 2
  const numGroups = Math.ceil(playerCount / playersPerGroup)
  const advancingPerGroup = 1

  const groupsResponse = await apiCall(
    `/tournaments/${tournamentId}/groups`,
    'POST',
    { numGroups, advancingPerGroup },
    organizerToken
  )

  if (!groupsResponse.ok) {
    const error = await groupsResponse.text()
    throw new Error(`Failed to create groups: ${groupsResponse.status} ${error}`)
  }

  return { id: tournamentId, name }
}

/**
 * PREREQUISITE: Create a singles tournament advanced into group stage, with a
 * focus player who holds a usable player-session token.
 *
 * Steps: create open singles tournament → register the focus player (capturing
 * the magicLinkToken from the 202 body) → register filler players →
 * CLOSE_REGISTRATION → POST /groups (moves to group_stage_active) →
 * GET /:id/auth/verify to exchange the magic link for a player-session token.
 *
 * The returned playerToken authenticates a real participant via the magic-link
 * (guest) flow: Authorization: Bearer <playerToken>.
 */
export async function createSinglesTournamentInGroupStage(
  organizerToken: string,
  playerCount: number = 2,
  opts: { pastGroupDeadline?: boolean } = {}
): Promise<{
  tournamentId: string
  name: string
  playerToken: string
  playerId: string
  playerEmail: string
  playerName: string
}> {
  const config = { ...createTestTournament(), matchFormat: 'singles' }

  // Registration is gated by status (registration_open), not the deadline
  // timestamp — so we can put the group-stage deadline in the past to exercise
  // DEADLINE_PASSED while still registering players. Ordering must hold:
  // registrationDeadline < groupStageDeadline < knockoutStageDeadline.
  // Deadlines are TIMESTAMPTZ (migration 025), so a small past offset is enforced
  // correctly regardless of the server timezone.
  if (opts.pastGroupDeadline) {
    const min = 60 * 1000
    config.registrationDeadline = new Date(Date.now() - 4 * min).toISOString()
    config.groupStageDeadline = new Date(Date.now() - 2 * min).toISOString()
    config.knockoutStageDeadline = new Date(Date.now() + 7 * 24 * 60 * min).toISOString()
  }
  const { id: tournamentId, name } = await createTournamentWithOpenRegistration(
    config,
    organizerToken
  )

  // Register the focus player first and capture their magic link token
  const focus = createTestUser()
  const focusReg = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', {
    email: focus.email,
    name: focus.name,
  })
  if (!focusReg.ok) {
    throw new Error(`Failed to register focus player: ${focusReg.status} ${await focusReg.text()}`)
  }
  const { magicLinkToken } = await focusReg.json()
  if (!magicLinkToken) {
    throw new Error('Register response did not include magicLinkToken')
  }

  // Register the remaining players so a group + match can be formed
  for (let i = 1; i < playerCount; i++) {
    const filler = createTestUser()
    const reg = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', {
      email: filler.email,
      name: filler.name,
    })
    if (!reg.ok) {
      throw new Error(`Failed to register filler player: ${reg.status} ${await reg.text()}`)
    }
  }

  // Close registration and form groups (moves tournament to group_stage_active)
  const close = await apiCall(
    `/tournaments/${tournamentId}/advance`,
    'POST',
    { action: 'CLOSE_REGISTRATION' },
    organizerToken
  )
  if (!close.ok) {
    throw new Error(`Failed to close registration: ${close.status} ${await close.text()}`)
  }
  const groups = await apiCall(
    `/tournaments/${tournamentId}/groups`,
    'POST',
    { numGroups: 1, advancingPerGroup: 1 },
    organizerToken
  )
  if (!groups.ok) {
    throw new Error(`Failed to create groups: ${groups.status} ${await groups.text()}`)
  }

  // Exchange the magic link for a player-session token
  const verify = await apiCall(
    `/tournaments/${tournamentId}/auth/verify?token=${encodeURIComponent(magicLinkToken)}`,
    'GET'
  )
  if (!verify.ok) {
    throw new Error(`Failed to verify magic link: ${verify.status} ${await verify.text()}`)
  }
  const { playerToken, playerId } = await verify.json()

  return {
    tournamentId,
    name,
    playerToken,
    playerId,
    playerEmail: focus.email,
    playerName: focus.name,
  }
}

/**
 * PREREQUISITE: Create a doubles tournament advanced into group stage, with a
 * focus player (on a team) who holds a usable player-session token.
 *
 * Doubles registration is per-player without a partner; teams are auto-formed at
 * group creation. With playerCount = 4 → 1 group, 2 teams, 1 team-vs-team match,
 * and the focus player is a participant on one team.
 */
export async function createDoublesTournamentInGroupStage(
  organizerToken: string,
  playerCount: number = 4
): Promise<{
  tournamentId: string
  name: string
  playerToken: string
  playerId: string
  playerEmail: string
  playerName: string
}> {
  const config = { ...createTestTournament(), matchFormat: 'doubles' }
  const { id: tournamentId, name } = await createTournamentWithOpenRegistration(
    config,
    organizerToken
  )

  // Register the focus player first and capture their magic link token
  const focus = createTestUser()
  const focusReg = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', {
    email: focus.email,
    name: focus.name,
  })
  if (!focusReg.ok) {
    throw new Error(`Failed to register focus player: ${focusReg.status} ${await focusReg.text()}`)
  }
  const { magicLinkToken } = await focusReg.json()
  if (!magicLinkToken) {
    throw new Error('Register response did not include magicLinkToken')
  }

  // Register the remaining players so two teams + a match can be formed
  for (let i = 1; i < playerCount; i++) {
    const filler = createTestUser()
    const reg = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', {
      email: filler.email,
      name: filler.name,
    })
    if (!reg.ok) {
      throw new Error(`Failed to register filler player: ${reg.status} ${await reg.text()}`)
    }
  }

  // Close registration and form groups/teams (moves to group_stage_active)
  const close = await apiCall(
    `/tournaments/${tournamentId}/advance`,
    'POST',
    { action: 'CLOSE_REGISTRATION' },
    organizerToken
  )
  if (!close.ok) {
    throw new Error(`Failed to close registration: ${close.status} ${await close.text()}`)
  }
  const groups = await apiCall(
    `/tournaments/${tournamentId}/groups`,
    'POST',
    { numGroups: 1, advancingPerGroup: 1 },
    organizerToken
  )
  if (!groups.ok) {
    throw new Error(`Failed to create groups: ${groups.status} ${await groups.text()}`)
  }

  // Exchange the magic link for a player-session token
  const verify = await apiCall(
    `/tournaments/${tournamentId}/auth/verify?token=${encodeURIComponent(magicLinkToken)}`,
    'GET'
  )
  if (!verify.ok) {
    throw new Error(`Failed to verify magic link: ${verify.status} ${await verify.text()}`)
  }
  const { playerToken, playerId } = await verify.json()

  return {
    tournamentId,
    name,
    playerToken,
    playerId,
    playerEmail: focus.email,
    playerName: focus.name,
  }
}

// ============================================================================
// Organizer Authentication Helper
// ============================================================================

/**
 * Get organizer token from seeded test account
 *
 * This assumes the test database has a seeded organizer account:
 *   Email: organizer@test.com
 *   Password: testpass123
 *
 * Usage:
 *   const token = await getOrganizerToken()
 */
export async function getOrganizerToken(): Promise<string> {
  const response = await apiCall(API_ENDPOINTS.AUTH.LOGIN, 'POST', {
    email: 'organizer@test.com',
    password: 'testpass123',
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get organizer token: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.token
}
