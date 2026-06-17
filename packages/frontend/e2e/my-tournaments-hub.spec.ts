import { test, expect } from '@playwright/test'
import { getOrganizerToken, createSinglesTournamentInGroupStage } from './fixtures'
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

    await expect(page).toHaveURL(new RegExp(`/tournament/${fx.tournamentId}/matches`))
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()
  })
})
