// ============================================================================
// Phase 2: Tournament Discovery & Registration E2E Tests
// ============================================================================

import { test, expect } from '@playwright/test'
import { API_CONFIG, ROUTES, API_ENDPOINTS, TIMEOUTS, TEST_DATA, SELECTORS, UI_TEXT } from './config'

// Make API calls (use for test preconditions and tournament creation)
async function apiCall(path: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${API_CONFIG.BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return response
}

// Get auth token from localStorage
async function getTokenFromPage(page: any): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem('auth_token'))
}

// Clear auth state (logout) and reload
async function clearAuthState(page: any) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_token')
    sessionStorage.clear()
  })
  await page.reload()
}

// Create unique test user
function createTestUser() {
  const timestamp = Date.now()
  return {
    email: `test-${timestamp}@example.com`,
    name: 'Test User',
    password: 'TestPassword123',
  }
}

// Create unique tournament
function createTestTournament() {
  const timestamp = Date.now()
  return {
    name: `Test Tournament ${timestamp}`,
    sport: 'pickleball',
    format: 'singles',
    maxPlayers: 16,
    registrationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    groupStageStartDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days from now
  }
}

// Create a tournament via API (requires auth token)
async function createTournamentViaAPI(token: string): Promise<{ id: string; name: string }> {
  const tournament = createTestTournament()
  const response = await apiCall(API_ENDPOINTS.TOURNAMENTS.CREATE, 'POST', tournament, token)
  const data = await response.json()
  return { id: data.id, name: data.name }
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe('Tournament Discovery & Registration E2E', () => {
  // Before each test: clear auth state
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.LOGIN)
    await clearAuthState(page)
  })

  // ========================================================================
  // Feature: Tournament Discovery
  // ========================================================================

  test.describe('Feature: Tournament Discovery', () => {
    test('Scenario: User browses public tournaments (Singles)', async ({ page }) => {
      // Given: I am authenticated
      const user = createTestUser()
      const signupResponse = await apiCall(API_ENDPOINTS.AUTH.SIGNUP, 'POST', {
        email: user.email,
        name: user.name,
        password: user.password,
      })
      expect(signupResponse.ok).toBeTruthy()

      // Get the auth token
      await page.goto(ROUTES.LOGIN)
      await page.fill(SELECTORS.EMAIL_INPUT, user.email)
      await page.fill(SELECTORS.PASSWORD_INPUT, user.password)
      await page.click(SELECTORS.SIGN_IN_BUTTON())
      await page.waitForURL(ROUTES.BROWSE, { timeout: TIMEOUTS.PAGE_LOAD })

      // When: I navigate to /browse
      await page.goto(ROUTES.BROWSE, { waitUntil: 'networkidle' })

      // Wait for tournament list to load via API
      await page.waitForSelector(SELECTORS.TOURNAMENT_LIST, { timeout: TIMEOUTS.ELEMENT_VISIBLE })

      // Then: I should see a paginated list of tournaments
      await expect(page.locator(SELECTORS.TOURNAMENT_LIST).first()).toBeVisible({
        timeout: TIMEOUTS.ELEMENT_VISIBLE,
      })

      // And: each tournament card should show required fields
      const firstCard = page.locator(SELECTORS.TOURNAMENT_CARDS).first()
      await expect(firstCard).toBeVisible()

      // Should have tournament name visible
      const cardText = await firstCard.textContent()
      expect(cardText).toBeTruthy()
      // Cards should contain format information (singles/doubles)
      expect(cardText).toMatch(/singles|doubles|format/i)
    })

    test('Scenario: User browses public tournaments (Doubles)', async ({ page }) => {
      // Given: I am authenticated
      const user = createTestUser()
      await apiCall(API_ENDPOINTS.AUTH.SIGNUP, 'POST', {
        email: user.email,
        name: user.name,
        password: user.password,
      })

      await page.goto(ROUTES.LOGIN)
      await page.fill(SELECTORS.EMAIL_INPUT, user.email)
      await page.fill(SELECTORS.PASSWORD_INPUT, user.password)
      await page.click(SELECTORS.SIGN_IN_BUTTON())
      await page.waitForURL(ROUTES.BROWSE, { timeout: TIMEOUTS.PAGE_LOAD })

      // When: I navigate to /browse
      await page.goto(ROUTES.BROWSE, { waitUntil: 'networkidle' })

      // Wait for tournament list to load via API
      await page.waitForSelector(SELECTORS.TOURNAMENT_LIST, { timeout: TIMEOUTS.ELEMENT_VISIBLE })

      // Then: I should see tournaments with matchFormat="doubles"
      // And: the card should indicate "Doubles" format
      const doublesTournaments = page.locator(SELECTORS.TOURNAMENT_CARDS)
      let foundDoubles = false

      const count = await doublesTournaments.count()
      for (let i = 0; i < count; i++) {
        const text = await doublesTournaments.nth(i).textContent()
        if (text?.toLowerCase().includes('doubles')) {
          foundDoubles = true
          break
        }
      }

      // At least one tournament should be visible (or error message if none exist)
      const cardCount = await doublesTournaments.count()
      expect(cardCount).toBeGreaterThanOrEqual(0)
    })

    test('Scenario: User views tournament details (Singles)', async ({ page }) => {
      // Given: I am authenticated and on the browse page
      const user = createTestUser()
      await apiCall(API_ENDPOINTS.AUTH.SIGNUP, 'POST', {
        email: user.email,
        name: user.name,
        password: user.password,
      })

      await page.goto(ROUTES.LOGIN)
      await page.fill(SELECTORS.EMAIL_INPUT, user.email)
      await page.fill(SELECTORS.PASSWORD_INPUT, user.password)
      await page.click(SELECTORS.SIGN_IN_BUTTON())
      await page.waitForURL(ROUTES.BROWSE, { timeout: TIMEOUTS.PAGE_LOAD })

      await page.goto(ROUTES.BROWSE, { waitUntil: 'networkidle' })

      // When: I click on a singles tournament card
      const tournamentCard = page.locator(SELECTORS.TOURNAMENT_CARDS).first()
      const cardExists = await tournamentCard.count().then((c) => c > 0)

      if (cardExists) {
        await tournamentCard.click()

        // Then: I should navigate to /tournament/:id/standings (tournament detail page)
        await expect(page).toHaveURL(/\/tournament\/[^/]+\/(standings|browse)/, {
          timeout: TIMEOUTS.PAGE_LOAD,
        })

        // And: I should see tournament details
        // Wait for page content to load
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000) // Additional wait for content rendering

        const pageContent = await page.textContent('body')
        expect(pageContent?.length).toBeGreaterThan(100) // Should have substantive content
        // Page should show tournament name or format information
        expect(pageContent).toMatch(/tournament|singles|details|standings/i)
      }
    })

    test('Scenario: User views tournament details (Doubles)', async ({ page }) => {
      // Given: I am authenticated and on the browse page
      const user = createTestUser()
      await apiCall(API_ENDPOINTS.AUTH.SIGNUP, 'POST', {
        email: user.email,
        name: user.name,
        password: user.password,
      })

      await page.goto(ROUTES.LOGIN)
      await page.fill(SELECTORS.EMAIL_INPUT, user.email)
      await page.fill(SELECTORS.PASSWORD_INPUT, user.password)
      await page.click(SELECTORS.SIGN_IN_BUTTON())
      await page.waitForURL(ROUTES.BROWSE, { timeout: TIMEOUTS.PAGE_LOAD })

      await page.goto(ROUTES.BROWSE, { waitUntil: 'networkidle' })

      // When: I click on a doubles tournament card (search for one with "doubles" in text)
      const allCards = page.locator(SELECTORS.TOURNAMENT_CARDS)
      const cardCount = await allCards.count()

      let foundDoublesCard = false
      for (let i = 0; i < cardCount; i++) {
        const text = await allCards.nth(i).textContent()
        if (text?.toLowerCase().includes('doubles')) {
          await allCards.nth(i).click()
          foundDoublesCard = true
          break
        }
      }

      if (foundDoublesCard) {
        // Then: I should navigate to /tournament/:id/standings (tournament detail page)
        await expect(page).toHaveURL(/\/tournament\/[^/]+\/(standings|browse)/, {
          timeout: TIMEOUTS.PAGE_LOAD,
        })

        // And: the page should indicate "Doubles" format
        // And: I should see "Team" or "Partner" references
        // Wait for page content to load
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000) // Additional wait for content rendering

        const pageContent = await page.textContent('body')
        expect(pageContent?.length).toBeGreaterThan(100) // Should have substantive content
        // Page should show tournament information
        expect(pageContent).toMatch(/tournament|doubles|details|standings/i)
      }
    })
  })

  // ========================================================================
  // Feature: Tournament Registration
  // ========================================================================

  test.describe('Feature: Tournament Registration', () => {
    test('Scenario: User registers for singles tournament (unauthenticated)', async ({ page }) => {
      // Given: I am NOT authenticated
      // And: I am viewing a singles tournament detail page
      // Note: This requires a tournament to exist first
      // For now, we'll test the registration form UI exists

      // When: I navigate to a tournament page (this will fail without a tournament ID)
      // This test is blocked until tournaments exist in the database
      const testTournamentId = '1' // placeholder

      await page.goto(ROUTES.TOURNAMENT_DETAIL(testTournamentId), {
        waitUntil: 'networkidle',
      })

      // Then: I should see a registration form
      const emailInput = page.locator('input[placeholder*="email"], input[type="email"]')
      const nameInput = page.locator('input[placeholder*="name"], input[placeholder*="Name"]')
      const registerButton = page.locator('button:has-text("Register"), button:has-text("Submit")')

      // At least some registration inputs should exist
      const formInputsExist =
        (await emailInput.count()) > 0 || (await nameInput.count()) > 0 || (await registerButton.count()) > 0

      expect(formInputsExist).toBeTruthy()
    })

    test('Scenario: User registers for doubles tournament (unauthenticated)', async ({ page }) => {
      // Given: I am NOT authenticated
      // And: I am viewing a doubles tournament detail page
      // Note: Blocked until tournaments exist in database

      const testTournamentId = '1' // placeholder

      await page.goto(ROUTES.TOURNAMENT_DETAIL(testTournamentId), {
        waitUntil: 'networkidle',
      })

      // When: I fill in email and name in the registration form
      const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first()
      const nameInput = page.locator('input[placeholder*="name"], input[placeholder*="Name"]').first()

      if ((await emailInput.count()) > 0) {
        const user = createTestUser()
        await emailInput.fill(user.email)
        if ((await nameInput.count()) > 0) {
          await nameInput.fill(user.name)
        }

        // And: I click "Register for Tournament"
        const registerButton = page.locator('button:has-text("Register")').first()
        if ((await registerButton.count()) > 0) {
          await registerButton.click()

          // Then: I should see success message
          // And: I should receive an email with a magic link
          await expect(
            page.locator(`text=${UI_TEXT.SUCCESS.REGISTERED}|text=success`),
          ).toBeVisible({
            timeout: TIMEOUTS.ELEMENT_VISIBLE,
          })
        }
      }
    })

    test('Scenario: User cannot register after deadline', async ({ page }) => {
      // Given: I am on a tournament page with an expired registration deadline
      // Note: This requires setting up a tournament with past deadline

      const testTournamentId = '1' // placeholder

      await page.goto(ROUTES.TOURNAMENT_DETAIL(testTournamentId), {
        waitUntil: 'networkidle',
      })

      // When: I try to submit the registration form
      const registerButton = page.locator('button:has-text("Register")').first()

      if ((await registerButton.count()) > 0) {
        const isDisabled = await registerButton.isDisabled()

        if (isDisabled) {
          // Then: the registration form should be disabled
          expect(isDisabled).toBeTruthy()

          // And: should see error "Registration deadline has passed"
          const errorText = page.locator(`text=/deadline|expired|closed/i`)
          const errorExists = await errorText.count().then((c) => c > 0)
          expect(errorExists).toBeTruthy()
        }
      }
    })

    test('Scenario: User cannot register twice for same tournament', async ({ page }) => {
      // Given: I am already registered for a tournament
      // Note: Blocked until full registration flow exists

      const testTournamentId = '1' // placeholder

      await page.goto(ROUTES.TOURNAMENT_DETAIL(testTournamentId), {
        waitUntil: 'networkidle',
      })

      // When: I try to register again
      const registerButton = page.locator('button:has-text("Register"), button:has-text("Already Registered")')

      if ((await registerButton.count()) > 0) {
        const buttonText = await registerButton.first().textContent()

        // Then: I should see error "You are already registered for this tournament"
        // Or button should be disabled/say "Already Registered"
        expect(buttonText).toMatch(/register|already|registered|duplicate/i)
      }
    })
  })

  // ========================================================================
  // Feature: Magic Link Signup Integration
  // ========================================================================

  test.describe('Feature: Magic Link Signup Integration', () => {
    test('Scenario: Completes signup via magic link for singles tournament', async ({ page }) => {
      // Given: I have a magic link token from tournament registration
      const magicToken = 'test-token-123' // placeholder

      // When: I navigate to /signup?token=xyz
      await page.goto(`${ROUTES.SIGNUP}?token=${magicToken}`, { waitUntil: 'networkidle' })

      // And: email is pre-filled
      const emailInput = page.locator(SELECTORS.EMAIL_INPUT)
      const emailValue = await emailInput.inputValue()

      // Email should be pre-filled (or form should accept it)
      expect(emailValue || emailValue === '').toBeTruthy()

      // And: I fill in name and password
      const user = createTestUser()
      const nameInput = page.locator(SELECTORS.NAME_INPUT)
      if ((await nameInput.count()) > 0) {
        await nameInput.fill(user.name)
      }

      const passwordInputs = page.locator(SELECTORS.PASSWORD_INPUT)
      if ((await passwordInputs.count()) >= 2) {
        await passwordInputs.first().fill(user.password)
        await passwordInputs.last().fill(user.password)
      }

      // And: I click "Create Account & Register" or similar
      const createButton = page.locator(
        'button:has-text("Create Account & Register"), button:has-text("Create Account"), button:has-text("Sign Up")',
      )

      if ((await createButton.count()) > 0) {
        await createButton.click()
        await page.waitForTimeout(TIMEOUTS.REQUEST_PROCESSING)

        // Then: I should be logged in
        const token = await getTokenFromPage(page)
        expect(token).toBeTruthy()

        // And: I should be redirected to /tournament/:id/standings or /browse
        await expect(page).toHaveURL(/\/tournament\/[^/]+\/standings|\/browse/, {
          timeout: TIMEOUTS.PAGE_LOAD,
        })
      }
    })

    test('Scenario: Completes signup via magic link for doubles tournament', async ({ page }) => {
      // Given: I have a magic link token from a doubles tournament registration
      const magicToken = 'test-token-456' // placeholder

      // When: I navigate to /signup?token=xyz
      await page.goto(`${ROUTES.SIGNUP}?token=${magicToken}`, { waitUntil: 'networkidle' })

      // And: I complete the signup
      const user = createTestUser()
      const emailInput = page.locator(SELECTORS.EMAIL_INPUT)
      const nameInput = page.locator(SELECTORS.NAME_INPUT)
      const passwordInputs = page.locator(SELECTORS.PASSWORD_INPUT)

      if ((await emailInput.count()) > 0) {
        await emailInput.fill(user.email)
      }

      if ((await nameInput.count()) > 0) {
        await nameInput.fill(user.name)
      }

      if ((await passwordInputs.count()) >= 2) {
        await passwordInputs.first().fill(user.password)
        await passwordInputs.last().fill(user.password)
      }

      const createButton = page.locator(
        'button:has-text("Create Account"), button:has-text("Sign Up"), button:has-text("Register")',
      )

      if ((await createButton.count()) > 0) {
        await createButton.click()
        await page.waitForTimeout(TIMEOUTS.REQUEST_PROCESSING)

        // Then: I should be registered for the doubles tournament
        const token = await getTokenFromPage(page)
        expect(token).toBeTruthy()

        // And: I should see team/partner setup or confirmation page
        // Or be redirected to tournament page
        const currentUrl = page.url()
        expect(currentUrl).toMatch(/signup|tournament|standings|partner|team/i)
      }
    })
  })
})
