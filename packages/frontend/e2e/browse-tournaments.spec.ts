import { test, expect } from '@playwright/test'
import { ROUTES } from './config'
import { apiCall, getOrganizerToken, createTournamentWithOpenRegistration, createTestTournament } from './fixtures'

/**
 * Public Tournament Discovery (per rac8-4s-HL.md "Tournament Discovery & Registration Flow").
 *
 * /browse is PUBLIC: an unauthenticated visitor can discover tournaments without logging in.
 * These tests seed open tournaments via an organizer, then browse as a guest (no auth).
 */
test.describe('Browse Tournaments E2E (public discovery)', () => {
  let doublesTournament: { id: string; name: string }
  let singlesTournament: { id: string; name: string }

  test.beforeAll(async () => {
    const organizerToken = await getOrganizerToken()
    doublesTournament = await createTournamentWithOpenRegistration(
      { ...createTestTournament(), matchFormat: 'doubles' },
      organizerToken
    )
    singlesTournament = await createTournamentWithOpenRegistration(
      { ...createTestTournament(), matchFormat: 'singles' },
      organizerToken
    )
  })

  test.beforeEach(async ({ page }) => {
    // Browse as a guest: ensure there is no auth state.
    await page.goto(ROUTES.HOME)
    await page.evaluate(() => localStorage.clear())
    await page.goto(ROUTES.BROWSE)
    await page.waitForLoadState('networkidle')
  })

  test.describe('Feature: Public access', () => {
    test('Scenario: Unauthenticated visitor can open /browse (no redirect to login)', async ({ page }) => {
      // Then: I stay on /browse and am NOT redirected to /login
      await expect(page).toHaveURL(/\/browse/)
      await expect(page.locator('h1')).toContainText('Browse')
    })
  })

  test.describe('Feature: Tournament Discovery', () => {
    test('Scenario: Visitor sees browse header and search', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Browse')
      await expect(page.locator('text=Find a night, find a tournament')).toBeVisible()
      await expect(page.locator('text=Search clubs, players, venues')).toBeVisible()
    })

    test('Scenario: Visitor sees the list of open tournaments', async ({ page }) => {
      const cards = page.locator('[data-testid="tournament-card"]')
      await expect(cards.first()).toBeVisible()
      expect(await cards.count()).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Feature: Tournament Filtering', () => {
    test('Scenario: Visitor sees all format filters', async ({ page }) => {
      for (const f of ['All', 'Doubles', 'Singles', 'Mixed']) {
        await expect(page.locator(`button:has-text("${f}")`)).toBeVisible()
      }
    })

    test('Scenario: Visitor can filter by format and reset', async ({ page }) => {
      await page.click('button:has-text("Singles")')
      await expect(page.locator('[data-testid="tournament-card"]').first()).toBeVisible()

      await page.click('button:has-text("Doubles")')
      await expect(page.locator('[data-testid="tournament-card"]').first()).toBeVisible()

      await page.click('button:has-text("All")')
      const cards = page.locator('[data-testid="tournament-card"]')
      expect(await cards.count()).toBeGreaterThanOrEqual(1)
    })
  })

  test.describe('Feature: Navigate to public details', () => {
    test('Scenario: Clicking a tournament opens its public details page', async ({ page }) => {
      // When: I click the first tournament card
      await page.locator('[data-testid="tournament-card"]').first().click()
      // Then: I land on the public tournament details page (/tournament/:id/browse)
      await expect(page).toHaveURL(/\/tournament\/[^/]+\/browse/)
    })
  })

  test.describe('Feature: Error Handling', () => {
    test('Scenario: Visitor sees error/empty state if the API fails', async ({ page }) => {
      await page.route('**/tournaments/public', route => route.abort('failed'))
      await page.reload()
      const hasError = await page.locator('text=/error|failed|could not|unable/i').first().isVisible().catch(() => false)
      const hasEmpty = await page.locator('text=/no tournaments|empty/i').first().isVisible().catch(() => false)
      expect(hasError || hasEmpty).toBeTruthy()
    })
  })

  test.describe('Feature: Page Layout', () => {
    test('Scenario: Page is mobile responsive', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(ROUTES.BROWSE)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('h1:has-text("Browse")')).toBeVisible()
      await expect(page.locator('button:has-text("All")')).toBeVisible()
    })
  })
})
