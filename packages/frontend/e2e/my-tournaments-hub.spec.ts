import { test, expect } from '@playwright/test'
import {
  apiCall,
  getOrganizerToken,
  createSinglesTournamentInGroupStage,
  createTestUser,
  createTestTournament,
  createTournamentWithOpenRegistration,
  defaultAgeAttestation,
} from './fixtures'
import { SELECTORS } from './config'

/**
 * E2E: the /standings and /matches tabs are "my tournaments" hubs with a
 * 0/1/2+ rule. A player in exactly one tournament is taken straight to that
 * tournament's view (no picker click). (The 2+ list is covered in the
 * MyTournamentsHub unit test.)
 */
test.describe('My tournaments hubs — single-tournament redirect', () => {
  test('a one-tournament player lands directly on their standings', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, fx.playerToken)

    await page.goto('/standings')

    // eslint-disable-next-line security/detect-non-literal-regexp -- fx.tournamentId comes from the test fixture's own setup, not user input
    await expect(page).toHaveURL(new RegExp(`/tournament/${fx.tournamentId}/standings`))
    await expect(page.locator(SELECTORS.STANDINGS_TABLE)).toBeVisible()
  })

  test('a one-tournament player lands directly on their matches', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, fx.playerToken)

    await page.goto('/matches')

    // eslint-disable-next-line security/detect-non-literal-regexp -- fx.tournamentId comes from the test fixture's own setup, not user input
    await expect(page).toHaveURL(new RegExp(`/tournament/${fx.tournamentId}/matches`))
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()
  })
})

/**
 * Registers one player (by email) into two tournaments in different states —
 * an open-registration tournament and one advanced to group_stage_active —
 * and returns a magic-link player-session token for that player. Mirrors the
 * essential steps of createSinglesTournamentInGroupStage, but parameterized
 * by email/name so the SAME durable player (matched by email) ends up
 * registered across both tournaments.
 */
async function setupMultiTournamentPlayer(
  organizerToken: string,
  email: string,
  name: string
): Promise<{
  tournamentA: { id: string; name: string }
  tournamentB: { id: string; name: string }
  playerToken: string
}> {
  const tournamentA = await createTournamentWithOpenRegistration(
    { ...createTestTournament(), matchFormat: 'singles' },
    organizerToken
  )
  const regA = await apiCall(`/tournaments/${tournamentA.id}/register`, 'POST', {
    email,
    name,
    dob_attestation: defaultAgeAttestation(),
  })
  if (!regA.ok) throw new Error(`Register (tournament A) failed: ${regA.status} ${await regA.text()}`)
  const { magicLinkToken } = await regA.json()

  const tournamentB = await createTournamentWithOpenRegistration(
    { ...createTestTournament(), matchFormat: 'singles' },
    organizerToken
  )
  const regB = await apiCall(`/tournaments/${tournamentB.id}/register`, 'POST', {
    email,
    name,
    dob_attestation: defaultAgeAttestation(),
  })
  if (!regB.ok) throw new Error(`Register (tournament B) failed: ${regB.status} ${await regB.text()}`)

  // A second player so tournament B can form a group.
  const filler = createTestUser()
  const fillerReg = await apiCall(`/tournaments/${tournamentB.id}/register`, 'POST', {
    email: filler.email,
    name: filler.name,
    dob_attestation: defaultAgeAttestation(),
  })
  if (!fillerReg.ok) throw new Error(`Register filler failed: ${fillerReg.status} ${await fillerReg.text()}`)

  const close = await apiCall(
    `/tournaments/${tournamentB.id}/advance`,
    'POST',
    { action: 'CLOSE_REGISTRATION' },
    organizerToken
  )
  if (!close.ok) throw new Error(`Close registration (tournament B) failed: ${close.status} ${await close.text()}`)
  const groups = await apiCall(
    `/tournaments/${tournamentB.id}/groups`,
    'POST',
    { numGroups: 1, advancingPerGroup: 1 },
    organizerToken
  )
  if (!groups.ok) throw new Error(`Form groups (tournament B) failed: ${groups.status} ${await groups.text()}`)

  const verify = await apiCall(
    `/tournaments/${tournamentA.id}/auth/verify?token=${encodeURIComponent(magicLinkToken)}`,
    'GET'
  )
  if (!verify.ok) throw new Error(`Verify magic link failed: ${verify.status} ${await verify.text()}`)
  const { playerToken } = await verify.json()

  return { tournamentA, tournamentB, playerToken }
}

test.describe('My tournaments hub — multi-tournament depth', () => {
  test('Scenario: Multi-tournament player sees the hub list', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const email = `hub-list-${Date.now()}@example.com`
    const { tournamentA, tournamentB, playerToken } = await setupMultiTournamentPlayer(
      organizerToken,
      email,
      'Hub List'
    )

    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, playerToken)
    await page.goto('/standings')

    // No auto-redirect into a single tournament — the 2+ list renders instead.
    await expect(page).toHaveURL(/\/standings$/)
    await expect(page.locator(SELECTORS.MY_TOURNAMENTS)).toBeVisible()
    await expect(page.locator(SELECTORS.TOURNAMENT_ROW)).toHaveCount(2)
    await expect(
      page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentA.name })
    ).toContainText('Upcoming')
    await expect(
      page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentB.name })
    ).toContainText('Live')
  })

  test('Scenario: Row navigation', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const email = `hub-nav-${Date.now()}@example.com`
    const { tournamentA, playerToken } = await setupMultiTournamentPlayer(organizerToken, email, 'Hub Nav')

    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, playerToken)
    await page.goto('/standings')
    await expect(page.locator(SELECTORS.TOURNAMENT_ROW)).toHaveCount(2)

    await page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentA.name }).click()

    // eslint-disable-next-line security/detect-non-literal-regexp -- tournamentA.id comes from this test's own fixture setup, not user input
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentA.id}/standings`))
  })

  test('Scenario: Empty state for a player with no tournaments', async ({ page }) => {
    const user = createTestUser()
    const signupRes = await apiCall('/api/auth/signup', 'POST', {
      ...user,
      dob_attestation: defaultAgeAttestation(),
    })
    if (!signupRes.ok) throw new Error(`Signup failed: ${signupRes.status} ${await signupRes.text()}`)
    const { token } = await signupRes.json()

    await page.addInitScript(t => {
      localStorage.setItem('auth_token', t as string)
    }, token)
    await page.goto('/standings')

    await expect(page).toHaveURL(/\/standings$/)
    await expect(page.locator(SELECTORS.MY_TOURNAMENTS)).toBeVisible()
    await expect(page.locator(SELECTORS.EMPTY_STATE)).toBeVisible()
    await expect(page.locator(SELECTORS.ERROR_STATE)).toHaveCount(0)
    await expect(page.locator(SELECTORS.EMPTY_STATE).locator('a[href="/browse"]')).toBeVisible()
  })

  test('Scenario: Both personas see their tournaments', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const email = `hub-personas-${Date.now()}@example.com`
    const name = 'Hub Personas'
    const { tournamentA, tournamentB, playerToken } = await setupMultiTournamentPlayer(
      organizerToken,
      email,
      name
    )

    // Persona 1: magic-link player-session token.
    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, playerToken)
    await page.goto('/standings')
    await expect(page).toHaveURL(/\/standings$/)
    await expect(page.locator(SELECTORS.TOURNAMENT_ROW)).toHaveCount(2)
    await expect(
      page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentA.name })
    ).toBeVisible()
    await expect(
      page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentB.name })
    ).toBeVisible()

    // Persona 2: registered-account JWT for the SAME email — signup claims the
    // already-registered player (identity_auth_model), so this exercises the
    // resolvePlayerId fallback branch (account.playerId) against identical data.
    const signupRes = await apiCall('/api/auth/signup', 'POST', {
      email,
      name,
      password: 'TestPassword123',
      dob_attestation: defaultAgeAttestation(),
    })
    if (!signupRes.ok) throw new Error(`Signup failed: ${signupRes.status} ${await signupRes.text()}`)
    const { token: accountToken } = await signupRes.json()

    await page.evaluate(t => localStorage.setItem('auth_token', t as string), accountToken)
    await page.reload()

    await expect(page).toHaveURL(/\/standings$/)
    await expect(page.locator(SELECTORS.TOURNAMENT_ROW)).toHaveCount(2)
    await expect(
      page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentA.name })
    ).toBeVisible()
    await expect(
      page.locator(SELECTORS.TOURNAMENT_ROW, { hasText: tournamentB.name })
    ).toBeVisible()
  })
})
