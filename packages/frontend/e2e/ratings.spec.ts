/**
 * P13 — Skill Ratings: /profile panels (Your Rating + Recent Partners) E2E tests
 *
 * See RATINGS_IMPLEMENTATION.md Step 10.1. Covers, in order of value:
 *  1. The /profile rating panel shows the (provisional) marker below
 *     PROVISIONAL_MATCHES and drops it once a bucket settles.
 *  2. Privacy (R1) — GET /player/ratings never returns another player's
 *     numbers, proven through the real HTTP+DB stack, not a mocked handler.
 *  3. The Recent Partners panel (Phase 13, R28) shows a partner after a
 *     doubles match, and both panels render their empty state for a
 *     brand-new player.
 *
 * Step 5.3 (the seed control) was never built (R27 made the rating
 * display-only) — there is nothing to cover here for it.
 *
 * ⚠ registerPerEmailMaxAttempts is 3 (config.ts) — a legit user registers
 * ~once. Settling a bucket to PROVISIONAL_MATCHES therefore uses ONE
 * tournament with an (N+1)-player round-robin group rather than N separate
 * tournaments for the same email, which would trip that limiter.
 *
 * Run: npx playwright test ratings
 */

import { test, expect } from '@playwright/test'
import {
  apiCall,
  createTestUser,
  createSinglesTournamentInGroupStage,
  createDoublesTournamentInGroupStage,
  getOrganizerToken,
  signupViaApi,
} from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

// Mirrors packages/api/src/services/ratings-constants.ts PROVISIONAL_MATCHES.
// Not importable here — the frontend build never gets a rating constant
// (RATINGS_IMPLEMENTATION.md §0a trap 3) — so the count is restated with a
// pointer back to the source of truth instead.
const PROVISIONAL_MATCHES = 10

async function serversRunning(): Promise<boolean> {
  try {
    const [api, fe] = await Promise.all([
      fetch(`${API_CONFIG.BASE_URL}/health`).then(r => r.ok),
      fetch('http://localhost:5173').then(r => r.ok),
    ])
    return api && fe
  } catch {
    return false
  }
}

async function loginFrontend(page: any, user: { email: string; password: string }) {
  await page.goto('http://localhost:5173/login')
  await page.fill(SELECTORS.EMAIL_INPUT, user.email)
  await page.fill(SELECTORS.PASSWORD_INPUT, user.password)
  await page.click(SELECTORS.SIGN_IN_BUTTON())
  // Login always navigates to /play; accounts with no play history land on
  // /browse from there. Either is a valid "login succeeded" signal here.
  await page.waitForURL(/\/(play|browse)/, { timeout: 8000 })
}

/** Signs up an account for an email that already has a durable player row
 * (from a prior magic-link registration) — signup finds and links it rather
 * than creating a second player, then logs in via the frontend. */
async function linkAccountAndLogin(page: any, email: string, name: string): Promise<void> {
  const password = 'TestPassword123'
  await signupViaApi({ email, name, password })
  await loginFrontend(page, { email, password })
}

async function fetchBundle(tournamentId: string, token: string): Promise<any> {
  const res = await apiCall(`/tournaments/${tournamentId}/bundle`, 'GET', undefined, token)
  if (!res.ok) throw new Error(`bundle failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function submitScore(tournamentId: string, matchId: string, token: string): Promise<void> {
  const res = await apiCall(`/tournaments/${tournamentId}/matches/${matchId}/score`, 'POST', { score: '6-0, 6-0' }, token)
  if (!res.ok) throw new Error(`score submit failed: ${res.status} ${await res.text()}`)
}

test.describe('Skill Ratings (P13) — /profile panels', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('a bucket below PROVISIONAL_MATCHES shows the (provisional) marker', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const { tournamentId, playerToken, playerEmail, playerName } =
      await createSinglesTournamentInGroupStage(organizerToken, 2)

    const bundle = await fetchBundle(tournamentId, playerToken)
    await submitScore(tournamentId, bundle.matches.group[0].id, playerToken)

    await linkAccountAndLogin(page, playerEmail, playerName)
    await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle' })

    const row = page.locator('[data-testid="rating-pickleball-singles"]')
    await expect(row).toBeVisible({ timeout: 8000 })
    await expect(row).toContainText('provisional')
  })

  test('a bucket at PROVISIONAL_MATCHES settles — no (provisional) marker', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    // An (N+1)-player round-robin group so the focus player plays exactly N
    // matches — one tournament, one registration per email, no repeats.
    const { tournamentId, playerToken, playerId, playerEmail, playerName } =
      await createSinglesTournamentInGroupStage(organizerToken, PROVISIONAL_MATCHES + 1)

    const bundle = await fetchBundle(tournamentId, playerToken)
    const focusMatches = bundle.matches.group.filter(
      (m: any) => m.player1Id === playerId || m.player2Id === playerId
    )
    expect(focusMatches).toHaveLength(PROVISIONAL_MATCHES)
    for (const match of focusMatches) {
      await submitScore(tournamentId, match.id, playerToken)
    }

    await linkAccountAndLogin(page, playerEmail, playerName)
    await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle' })

    const row = page.locator('[data-testid="rating-pickleball-singles"]')
    await expect(row).toBeVisible({ timeout: 8000 })
    await expect(row).not.toContainText('provisional')
  })

  test('a brand-new player sees both panels in their empty state', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)
    await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle' })

    await expect(page.locator('[data-testid="rating-empty-state"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="partners-empty-state"]')).toBeVisible()
  })

  test('Recent Partners shows a partner after a doubles match (R28)', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const { tournamentId, playerToken, playerId, playerEmail, playerName } =
      await createDoublesTournamentInGroupStage(organizerToken, 4)

    const bundle = await fetchBundle(tournamentId, playerToken)
    await submitScore(tournamentId, bundle.matches.group[0].id, playerToken)

    await linkAccountAndLogin(page, playerEmail, playerName)
    await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle' })

    // The focus player's partner is whichever teammate isn't them — assert
    // some partner row rendered rather than pinning a specific id, since
    // team assignment within the group is not part of this contract.
    const partnerRows = page.locator('[data-testid^="partner-"]')
    await expect(partnerRows.first()).toBeVisible({ timeout: 8000 })
    const partnerTestIds: string[] = await partnerRows.evaluateAll(els => els.map(el => el.getAttribute('data-testid')))
    expect(partnerTestIds).not.toContain(`partner-${playerId}`)
  })

  test('PRIVACY (R1) — GET /player/ratings never returns another player\'s numbers', async () => {
    const organizerToken = await getOrganizerToken()
    const { tournamentId, playerToken: ratedToken, playerEmail, playerName } =
      await createSinglesTournamentInGroupStage(organizerToken, 2)
    const bundle = await fetchBundle(tournamentId, ratedToken)
    await submitScore(tournamentId, bundle.matches.group[0].id, ratedToken)

    const unrated = createTestUser()
    const unratedTokenRes = await apiCall('/test/player-token', 'POST', { email: unrated.email, name: unrated.name })
    const { playerToken: unratedToken } = await unratedTokenRes.json()

    const ratedRes = await apiCall('/player/ratings', 'GET', undefined, ratedToken)
    const unratedRes = await apiCall('/player/ratings', 'GET', undefined, unratedToken)

    const ratedBody = await ratedRes.json()
    const unratedBody = await unratedRes.json()

    expect(ratedBody.ratings.length).toBeGreaterThan(0)
    // The never-played player's own call returns nothing — not the rated
    // player's numbers leaking across sessions through a shared route.
    expect(unratedBody.ratings).toEqual([])
    // Sanity: the two tokens really are different players, not a fixture bug.
    expect(playerEmail).not.toBe(unrated.email)
    expect(playerName).toBeTruthy()
  })
})
