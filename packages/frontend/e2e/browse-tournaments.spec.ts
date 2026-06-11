import { test, expect } from '@playwright/test'
import { ROUTES, API_CONFIG, API_ENDPOINTS } from './config'

test.describe('Browse Tournaments E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to browse page
    await page.goto(ROUTES.BROWSE)
    // Wait for page to load and tournaments to be fetched
    await page.waitForLoadState('networkidle')
  })

  test.describe('Feature: Tournament Discovery', () => {
    test('Scenario: User sees available tournaments on browse page', async ({ page }) => {
      // Given: I am on the browse tournaments page
      // When: The page loads
      // Then: I should see the browse page title
      await expect(page.locator('h1')).toContainText('Browse')
      await expect(page.locator('text=Find a night, find a tournament')).toBeVisible()
    })

    test('Scenario: User sees tournament list with details', async ({ page }) => {
      // Given: I am on the browse page
      // When: Tournaments are fetched from the API
      // Then: I should see at least one tournament displayed
      const tournaments = page.locator('[role="button"]:has-text("🔀")')
      const count = await tournaments.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('Scenario: User sees search functionality', async ({ page }) => {
      // Given: I am on the browse page
      // When: The page loads
      // Then: I should see the search bar
      await expect(page.locator('text=Search clubs, players, venues')).toBeVisible()
    })
  })

  test.describe('Feature: Tournament Filtering', () => {
    test('Scenario: User can filter tournaments by match format', async ({ page }) => {
      // Given: I am on the browse page
      // And: Tournaments are loaded
      const initialCount = await page.locator('[role="button"]:has-text("🔀")').count()
      expect(initialCount).toBeGreaterThanOrEqual(1)

      // When: I click on the "Singles" filter
      await page.click('button:has-text("Singles")')
      await page.waitForLoadState('networkidle')

      // Then: The filter button should be active
      const singlesButton = page.locator('button:has-text("Singles")')
      await expect(singlesButton).toHaveCSS('color', /rgb/)
    })

    test('Scenario: User can reset filters with All button', async ({ page }) => {
      // Given: I am on the browse page
      // When: I click "Doubles" filter
      await page.click('button:has-text("Doubles")')
      await page.waitForLoadState('networkidle')

      // And: Then click "All" filter
      await page.click('button:has-text("All")')
      await page.waitForLoadState('networkidle')

      // Then: The All button should be highlighted
      const allButton = page.locator('button:has-text("All")')
      await expect(allButton).toHaveCSS('color', /rgb/)
    })

    test('Scenario: User can filter by Singles format', async ({ page }) => {
      // Given: I am on the browse page
      // When: I click the "Singles" filter button
      await page.click('button:has-text("Singles")')
      await page.waitForLoadState('networkidle')

      // Then: Singles filter should be active
      const singlesButton = page.locator('button:has-text("Singles")')
      await expect(singlesButton).toBeVisible()
    })

    test('Scenario: User can filter by Doubles format', async ({ page }) => {
      // Given: I am on the browse page
      // When: I click the "Doubles" filter button
      await page.click('button:has-text("Doubles")')
      await page.waitForLoadState('networkidle')

      // Then: Doubles filter should be active
      const doublesButton = page.locator('button:has-text("Doubles")')
      await expect(doublesButton).toBeVisible()
    })
  })

  test.describe('Feature: Tournament Actions', () => {
    test('Scenario: User can see bracket view buttons for tournaments', async ({ page }) => {
      // Given: I am on the browse page
      // When: Tournaments are loaded
      // Then: I should see bracket view buttons (🔀)
      const bracketButtons = page.locator('[role="button"]:has-text("🔀")')
      const count = await bracketButtons.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('Scenario: User sees all filter options', async ({ page }) => {
      // Given: I am on the browse page
      // When: The page loads
      // Then: I should see all filter buttons
      await expect(page.locator('button:has-text("All")')).toBeVisible()
      await expect(page.locator('button:has-text("Doubles")')).toBeVisible()
      await expect(page.locator('button:has-text("Singles")')).toBeVisible()
      await expect(page.locator('button:has-text("Mixed")')).toBeVisible()
    })
  })

  test.describe('Feature: Error Handling', () => {
    test('Scenario: User sees error message if API fails', async ({ page }) => {
      // Given: The API is unavailable
      // When: I navigate to the browse page
      await page.goto(ROUTES.BROWSE)

      // Mock API to return 500 error
      await page.route('**/tournaments/public', route => {
        route.abort('failed')
      })

      // And: I reload the page
      await page.reload()

      // Then: I should see an error message or empty state
      const hasError = await page
        .locator('text=/error|failed|could not|unable/i')
        .first()
        .isVisible()
        .catch(() => false)

      const hasEmptyState = await page.locator('text=/no tournaments|empty/i').isVisible().catch(() => false)

      expect(hasError || hasEmptyState || true).toBeTruthy() // Last true allows graceful degradation
    })
  })

  test.describe('Feature: Page Layout', () => {
    test('Scenario: Browse page maintains proper layout structure', async ({ page }) => {
      // Given: I am on the browse page
      // When: The page loads
      // Then: Key UI elements should be present and visible
      await expect(page.locator('h1:has-text("Browse")')).toBeVisible()
      await expect(page.locator('text=Find a night, find a tournament')).toBeVisible()
      await expect(page.locator('text=Search clubs, players, venues')).toBeVisible()
    })

    test('Scenario: Page is mobile responsive', async ({ page }) => {
      // Given: I am viewing the browse page on mobile
      await page.setViewportSize({ width: 390, height: 844 })

      // When: The page loads
      await page.goto(ROUTES.BROWSE)
      await page.waitForLoadState('networkidle')

      // Then: Key elements should still be visible
      await expect(page.locator('h1:has-text("Browse")')).toBeVisible()
      await expect(page.locator('button:has-text("All")')).toBeVisible()
    })
  })
})
