import { test, expect, Page } from '@playwright/test'
import { getOrganizerToken, createTournamentInKnockoutStage } from './fixtures'
import { SELECTORS } from './config'

/**
 * E2E: Tournament Participation — Bracket (Singles).
 *
 * Covers the documented scenarios in e2e-scenarios.md:
 *   - "User views bracket when pending generation (Singles)"
 *   - "User views published bracket (Singles)"
 *   - "User submits knockout score (Singles)"
 *
 * The bracket lives at /tournament/:id/bracket. The connector-line tree is the
 * shared view; a participant gets a Submit Score affordance on their own match
 * (reusing the same ScoreSubmitForm as the group stage). Each test seeds its own
 * tournament via the knockout-stage fixture for isolation.
 */
test.describe('Bracket Singles', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function inject(page: Page, token: string) {
    await page.addInitScript(t => localStorage.setItem('auth_token', t as string), token)
  }

  test('shows a pending-generation message before the bracket is generated', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'singles', publish: false })
    await inject(page, fx.focusToken)
    await page.goto(`/tournament/${fx.tournamentId}/bracket`)

    await expect(page.locator(SELECTORS.BRACKET_PENDING)).toBeVisible()
    await expect(page.locator(SELECTORS.BRACKET_PENDING)).toContainText(/group stage completes/i)
  })

  test('renders the published bracket as a round tree (Semifinals + Final)', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'singles' })
    await inject(page, fx.organizerToken)
    await page.goto(`/tournament/${fx.tournamentId}/bracket`)

    await expect(page.locator(SELECTORS.BRACKET_TREE)).toBeVisible()
    // 4-participant bracket → two rounds: Semifinals then Final
    await expect(page.locator(SELECTORS.BRACKET_ROUND)).toHaveCount(2)
    await expect(page.getByText('Semifinals')).toBeVisible()
    await expect(page.getByText(/^Final/)).toBeVisible()
  })

  test('a participant submits a knockout score from the bracket', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'singles' })
    expect(fx.knockoutMatch).not.toBeNull()
    await inject(page, fx.focusToken)
    await page.goto(`/tournament/${fx.tournamentId}/bracket`)

    // Target the focus player's own match by their name, then submit its score.
    const myMatch = page.getByTestId('match-card').filter({ hasText: fx.focusName })
    await myMatch.getByTestId('submit-score-button').first().click()
    await expect(page.getByTestId('score-submit-form')).toBeVisible()

    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()

    await expect(page.getByTestId('score-submit-form')).toBeHidden()
    await expect(page.getByText('11-9, 11-7')).toBeVisible()
  })
})
