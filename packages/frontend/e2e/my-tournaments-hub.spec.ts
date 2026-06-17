import { test, expect } from '@playwright/test'
import { getOrganizerToken, createSinglesTournamentInGroupStage } from './fixtures'

/**
 * E2E: the /standings tab is a "My Tournaments" hub — it lists the tournaments
 * the authenticated player is in (real data), each linking to that tournament's
 * standings tab.
 */
test.describe('My Tournaments hub (/standings)', () => {
  test('a player sees their tournaments and can open standings', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, fx.playerToken)

    await page.goto('/standings')
    await expect(page).toHaveURL(/\/standings/)

    // The player's real tournament is listed and links to its standings tab
    const link = page.getByRole('link', { name: new RegExp(fx.name) })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', new RegExp(`/tournament/${fx.tournamentId}/standings`))
  })
})
