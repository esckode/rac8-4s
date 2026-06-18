import { test, expect, Page } from '@playwright/test'
import { apiCall, getOrganizerToken, createTournamentInKnockoutStage } from './fixtures'
import { SELECTORS } from './config'

/**
 * E2E: Tournament Participation — Bracket (Doubles).
 *
 * Covers the documented scenarios in e2e-scenarios.md:
 *   - "User views bracket with team names (Doubles)"
 *   - "User submits team knockout score (Doubles)"
 *
 * Doubles knockout participants are teams: the bracket must show team names
 * (resolved from standings), not raw team IDs, and a team member submits the
 * score via their magic-link player session (backend resolves the team).
 */
test.describe('Bracket Doubles', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function inject(page: Page, token: string) {
    await page.addInitScript(t => localStorage.setItem('auth_token', t as string), token)
  }

  test('renders the bracket with team names, not IDs', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'doubles' })
    await inject(page, fx.organizerToken)

    // Pull a real team name from standings to assert it surfaces in the tree.
    const bundleRes = await apiCall(`/tournaments/${fx.tournamentId}/bundle`, 'GET', undefined, fx.organizerToken)
    const bundle = await bundleRes.json()
    const teamName: string | undefined = (bundle.standings ?? [])
      .flatMap((g: any) => g.standings ?? [])
      .map((s: any) => s.name)
      .find((n: string) => !!n)
    expect(teamName).toBeTruthy()

    await page.goto(`/tournament/${fx.tournamentId}/bracket`)
    await expect(page.locator(SELECTORS.BRACKET_TREE)).toBeVisible()
    await expect(page.getByTestId('match-card').filter({ hasText: teamName! }).first()).toBeVisible()
    // The bracket must not fall back to raw UUID identifiers.
    await expect(page.locator(SELECTORS.BRACKET_TREE)).not.toContainText(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i
    )
  })

  test('a team member submits a knockout score from the bracket', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'doubles' })
    expect(fx.knockoutMatch).not.toBeNull()
    await inject(page, fx.focusToken)
    await page.goto(`/tournament/${fx.tournamentId}/bracket`)

    // The focus team is the sole pending knockout match (the final).
    await page.getByTestId('submit-score-button').first().click()
    await expect(page.getByTestId('score-submit-form')).toBeVisible()

    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()

    await expect(page.getByTestId('score-submit-form')).toBeHidden()
    await expect(page.getByText('11-9, 11-7')).toBeVisible()
  })
})
