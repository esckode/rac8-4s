import { test, expect } from '@playwright/test'
import { apiCall, getOrganizerToken, createTestTournament } from './fixtures'
import { API_ENDPOINTS } from './config'

/**
 * E2E: Organizer Home (/organizer) — lists the organizer's tournaments and links
 * each into the management screen. Discovery is via the existing organizer-only
 * "Organizer Dashboard" nav entry; here we navigate directly. The organizer
 * authenticates with an account JWT injected into localStorage.
 */
test.describe('Organizer Home', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  test('lists the organizer tournaments and links a row to its management screen', async ({ page }) => {
    // Create a uniquely-named tournament owned by the organizer (newest → top of the list)
    const config = createTestTournament()
    const create = await apiCall(API_ENDPOINTS.TOURNAMENTS.CREATE, 'POST', config, organizerToken)
    expect(create.ok).toBeTruthy()
    const { id: tournamentId } = await create.json()

    await page.addInitScript((t: string) => localStorage.setItem('auth_token', t), organizerToken)
    await page.goto('/organizer')

    const row = page.getByTestId('organizer-tournament-row').filter({ hasText: config.name })
    await expect(row).toBeVisible()

    await row.click()
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}/manage`))
  })
})
