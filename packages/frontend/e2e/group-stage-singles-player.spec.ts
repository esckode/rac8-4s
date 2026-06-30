import { test, expect } from '@playwright/test'
import { getOrganizerToken, createSinglesTournamentInGroupStage } from './fixtures'
import { SELECTORS } from './config'

/**
 * E2E: Tournament Participation — Group Stage (Singles), player view.
 *
 * Covers the documented scenarios in e2e-scenarios.md:
 *   - "User views tournament standings (Singles)"
 *   - "User views upcoming matches (Singles)"
 *
 * The player authenticates with a magic-link player-session token (not an
 * account login), per the public guest-participation model. The token is
 * injected into localStorage before the protected route loads, exercising the
 * real useAuth session-restore path.
 */
test.describe('Group Stage Singles - Player view', () => {
  let tournamentId: string
  let playerToken: string

  test.beforeAll(async () => {
    const organizerToken = await getOrganizerToken()
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    tournamentId = fixture.tournamentId
    playerToken = fixture.playerToken
  })

  test.beforeEach(async ({ page }) => {
    // Authenticate as the magic-link player before any protected route loads
    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, playerToken)
  })

  test('player views tournament standings', async ({ page }) => {
    await page.goto(`/tournament/${tournamentId}/standings`)

    // Must NOT be bounced to login — the player session satisfies auth
    // eslint-disable-next-line security/detect-non-literal-regexp -- tournamentId comes from the test fixture's own setup, not user input
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}/standings`))

    const table = page.locator(SELECTORS.STANDINGS_TABLE)
    await expect(table).toBeVisible()
  })

  test('player views upcoming matches', async ({ page }) => {
    await page.goto(`/tournament/${tournamentId}/matches`)

    // eslint-disable-next-line security/detect-non-literal-regexp -- tournamentId comes from the test fixture's own setup, not user input
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}/matches`))

    const matchCards = page.locator(SELECTORS.BRACKET_MATCHES)
    await expect(matchCards.first()).toBeVisible()
  })
})
