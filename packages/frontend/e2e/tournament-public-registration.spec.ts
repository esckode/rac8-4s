import { test, expect } from '@playwright/test'
import { ROUTES, SELECTORS, UI_TEXT } from './config'
import { apiCall, getOrganizerToken, createTournamentWithOpenRegistration, createTestTournament } from './fixtures'

/**
 * Public guest registration (per rac8-4s-HL.md "Tournament Discovery & Registration Flow").
 *
 * An unauthenticated visitor opens a tournament's public details page
 * (/tournament/:id/browse), registers with email + name, and is told to check their
 * email for a magic link. No login is required to register.
 */
test.describe('Public Tournament Registration (guest)', () => {
  let tournament: { id: string; name: string }

  test.beforeAll(async () => {
    const organizerToken = await getOrganizerToken()
    tournament = await createTournamentWithOpenRegistration(
      { ...createTestTournament(), matchFormat: 'singles' },
      organizerToken
    )
  })

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.HOME)
    await page.evaluate(() => localStorage.clear())
    await page.goto(ROUTES.TOURNAMENT_BROWSE(tournament.id))
    await page.waitForLoadState('networkidle')
  })

  test('Scenario: Guest sees the public tournament details and registration form', async ({ page }) => {
    // Stays public (not redirected to login)
    await expect(page).toHaveURL(/\/tournament\/[^/]+\/browse/)
    // Shows the tournament identity + status
    await expect(page.locator(`text=${tournament.name}`)).toBeVisible()
    await expect(page.locator('text=/registration open/i')).toBeVisible()
    // Registration section for unauthenticated users
    await expect(page.locator(SELECTORS.EMAIL_INPUT)).toBeVisible()
    await expect(page.locator(SELECTORS.NAME_INPUT)).toBeVisible()
    await expect(page.locator('button:has-text("Register")')).toBeVisible()
  })

  test('Scenario: Guest can offer to sign in instead', async ({ page }) => {
    await page.locator(SELECTORS.SIGN_IN_LINK).first().click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('Scenario: Guest registers with email and name and is told to check email', async ({ page }) => {
    const email = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    await page.fill(SELECTORS.EMAIL_INPUT, email)
    await page.fill(SELECTORS.NAME_INPUT, 'Guest Player')
    await page.click('button:has-text("Register")')

    // Then: a success / check-your-email confirmation is shown (magic link sent)
    await expect(page.locator('text=/check your email/i').first()).toBeVisible()
  })

  test('Scenario: Registering an already-registered email shows a clear error', async ({ page }) => {
    const email = `dupe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    // First registration via API (public endpoint)
    await apiCall(`/tournaments/${tournament.id}/register`, 'POST', { email, name: 'Dupe Player' })

    // Second registration via the UI should surface a conflict, not crash
    await page.fill(SELECTORS.EMAIL_INPUT, email)
    await page.fill(SELECTORS.NAME_INPUT, 'Dupe Player')
    await page.click('button:has-text("Register")')

    await expect(page.locator('text=/already|exists|registered/i').first()).toBeVisible()
  })
})
