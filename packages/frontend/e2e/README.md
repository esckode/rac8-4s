# E2E Test Patterns & Reusable Helpers

This document outlines the patterns, helpers, and conventions established in Phase 1 (Authentication) that should be used consistently across all subsequent phases.

## Conventions (must-follow)

These are non-negotiable; ignoring them is how specs rot or flake:

1. **Seed your own data.** Never assume tournaments/users already exist in the DB. Create what you need via the fixtures (`getOrganizerToken`, `createTournamentWithOpenRegistration`, `createTournamentWithGroups`, …) in `beforeAll`/`beforeEach`. Tests that depend on ambient DB state fail in clean environments.
2. **Use stable selectors.** Prefer `data-testid` and the constants in `config.ts` (`SELECTORS`, `UI_TEXT`, `ROUTES`). Don't target emoji, `:nth-child`, or guessed `role` text — they drift with the UI.
3. **Unique test data.** Generate emails/names with a timestamp **and** a random suffix (`createTestUser()` does this). Playwright runs each browser project (chromium, firefox) in a separate worker process, so timestamp-only values collide across projects → `409 DUPLICATE_VALUE`.
4. **Respect route access (it follows `rac8-4s-HL.md`).** Public: `/browse`, `/tournament/:id/browse` (guest registration). Auth-gated: `/matches`, `/standings`, tournament detail. **Authenticate before visiting protected routes**; for "must redirect to login" assertions use a protected route like `/matches` (not `/browse`, which is public).
5. **Match the real API contract.** `GET /tournaments/:id/groups` returns a `players` array (not `playerCount`); the score endpoint returns `{ winnerId, status }`. Assert what the API actually returns — verify against the route, don't guess field names.
6. **`TEMPLATE.spec.ts` is a scaffold,** excluded from runs via `testIgnore` in `playwright.config.ts`. Copy it to a real filename to use it; don't add assertions to the template itself.
7. **`pwa-*.spec.ts` need a production build, not the dev server.** They run only on
   the `pwa` project (chromium, `baseURL: http://localhost:4173`) and are excluded
   from `chromium`/`firefox` via `testIgnore`. The injected precache manifest and
   the built service worker only exist after `vite build`, and module service
   workers don't run on Firefox dev — so before running them: have the API up on
   :3001, then `npm run preview:pwa --workspace=packages/frontend` (builds + serves
   preview on :4173) in a separate terminal. Run with
   `npx playwright test --project=pwa`.

## Core Helper Functions

All e2e tests should include these helpers at the top of the file:

```typescript
import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:3001'

// Make authenticated or unauthenticated API calls
async function apiCall(path: string, method: string, body?: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return response
}

// Extract auth token from localStorage (used to verify login)
async function getTokenFromPage(page: any): Promise<string | null> {
  return await page.evaluate(() => localStorage.getItem('auth_token'))
}

// Clear auth state and reload page (used for logout/reset between tests)
async function clearAuthState(page: any) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_token')
    sessionStorage.clear()
  })
  await page.reload()
}

// Create unique test user for each test run (no conflicts)
function createTestUser() {
  const timestamp = Date.now()
  return {
    email: `test-${timestamp}@example.com`,
    name: 'Test User',
    password: 'TestPassword123',
  }
}
```

## Test File Structure

Each test file should follow this organization:

```typescript
import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:3001'

// [Include all helper functions above]

test.describe('Feature Group Name E2E', () => {
  // Setup before each test - clear auth state
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await clearAuthState(page)
  })

  // Feature group 1
  test.describe('Feature: Feature Group 1', () => {
    test('Scenario: scenario name', async ({ page }) => {
      // Test body
    })
  })

  // Feature group 2
  test.describe('Feature: Feature Group 2', () => {
    test('Scenario: scenario name', async ({ page }) => {
      // Test body
    })
  })
})
```

## Test Naming Convention

Use explicit Gherkin-style names that reference `e2e-scenarios.md`:

```typescript
// ✅ GOOD - Matches Gherkin scenario name exactly
test('Scenario: User successfully registers for tournament', async ({ page }) => { ... })

// ❌ AVOID - Vague names that don't reference requirements
test('should register', async ({ page }) => { ... })
```

## Test Body Pattern: Given/When/Then

Structure test bodies with comments that match Gherkin:

```typescript
test('Scenario: User browses tournaments', async ({ page }) => {
  // Given: I am authenticated
  const user = createTestUser()
  await apiCall('/api/auth/signup', 'POST', { ... })
  
  // When: I navigate to /browse
  await page.goto('/browse')
  
  // Then: I should see a list of tournaments
  await expect(page.locator('tournament cards')).toBeVisible()
})
```

## Common Element Selectors

Use these patterns for selecting form inputs and buttons:

```typescript
// Email input
await page.fill('input[type="email"]', testEmail)

// Password input (first of multiple)
await page.locator('input[type="password"]').first().fill(password)

// Named input by placeholder
await page.fill('input[placeholder="Your full name"]', name)

// Button by text (with fallback for variations)
await page.click('button:has-text("Sign In"), button:has-text("Log In")')

// Link by text
await page.click('text=Sign in')

// Flexible selector for radio/checkbox
await page.click('input[value="singles"]')

// By aria-label (for accessibility)
await page.click('[aria-label="Register"]')

// By data-testid (best practice)
await page.click('[data-testid="submit-button"]')
```

## Data Patterns

### Unique Test Data

Use `Date.now()` for guaranteed uniqueness without database cleanup:

```typescript
// ✅ GOOD - No conflicts between parallel test runs
const uniqueEmail = `test-${Date.now()}@example.com`

// ✅ GOOD - Use helper function
const user = createTestUser()  // Returns { email: `test-${timestamp}@...`, ... }

// ❌ AVOID - Will conflict when tests run in parallel
const email = 'testuser@example.com'
```

### Test Data Structure

For complex objects (tournaments, players, etc.):

```typescript
function createTestTournament() {
  return {
    name: `Tournament ${Date.now()}`,
    sport: 'pickleball',
    format: 'singles',
    maxPlayers: 16,
    registrationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  }
}

function createTestDoublesToournament() {
  return {
    ...createTestTournament(),
    format: 'doubles',
  }
}
```

## Navigation & URL Patterns

### Flexible URL Matching

Use regex patterns to handle route variations:

```typescript
// ✅ GOOD - Matches multiple possible destinations
await expect(page).toHaveURL(/\/browse|\/dashboard/)

// ✅ GOOD - Wait for specific URL with timeout
await page.waitForURL('/tournament/[0-9]+', { timeout: 10000 })

// ❌ AVOID - Brittle - breaks if route changes
await expect(page).toHaveURL('/browse')
```

### Navigation with Network Waits

Always wait for network when navigating to new routes:

```typescript
// ✅ GOOD - Waits for network requests to complete
await page.goto('/browse', { waitUntil: 'networkidle' })

// ✅ GOOD - For API-heavy pages
await page.waitForURL(/\/tournament\//, { timeout: 10000 })

// ❌ AVOID - May not wait for data to load
await page.goto('/browse')
```

## API Precondition Pattern

Set up test data via API before testing UI:

```typescript
test('Scenario: User can view tournament details', async ({ page }) => {
  // Given: A tournament exists
  const tournamentResponse = await apiCall('/api/tournaments', 'POST', {
    name: 'Test Tournament',
    format: 'singles',
  })
  const tournament = await tournamentResponse.json()

  // When: I navigate to the tournament page
  await page.goto(`/tournament/${tournament.id}`)

  // Then: I see the tournament details
  await expect(page.locator('h1')).toContainText('Test Tournament')
})
```

## Wait Patterns

Use appropriate waits based on what you're waiting for:

```typescript
// Wait for element visibility
await expect(page.locator('.tournament-list')).toBeVisible()

// Wait for URL change
await expect(page).toHaveURL('/browse')

// Wait for specific URL pattern with timeout
await page.waitForURL(/\/tournament\/[0-9]+/, { timeout: 10000 })

// Wait for network to be idle (all requests complete)
await page.goto('/browse', { waitUntil: 'networkidle' })

// Wait for custom condition
await page.waitForFunction(() => {
  return document.querySelectorAll('.tournament-card').length > 0
}, { timeout: 5000 })

// Simple delay (use sparingly)
await page.waitForTimeout(2000)
```

## Error & Validation Patterns

### Flexible Validation

Allow for UI variations with fallback patterns:

```typescript
// ✅ GOOD - Checks for success without brittle selectors
const successMessage = page.locator('text=/success|sent|created/i')
await expect(successMessage).toBeVisible().catch(() => {
  // If no explicit message, verify we're still on the page
  return expect(page).toHaveURL('/tournament')
})

// ✅ GOOD - Optional element checking
const optionalLabel = page.locator('label:has-text("Email")')
if (await optionalLabel.isVisible({ timeout: 500 }).catch(() => false)) {
  await expect(optionalLabel).toBeVisible()
}
```

### Error Message Detection

```typescript
// Wait for error to appear
await expect(page.locator('text=Invalid email')).toBeVisible({ timeout: 5000 })

// Or use regex for variations
await expect(page.locator('text=/invalid|error|failed/i')).toBeVisible()

// Check button disabled state
const submitButton = page.locator('button:has-text("Submit")')
await expect(submitButton).toBeDisabled()
```

## State Verification Patterns

### Token & Auth State

```typescript
// Verify user is logged in
const token = await getTokenFromPage(page)
expect(token).toBeTruthy()

// Verify token is valid JWT format
expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

// Verify user is logged out
const token = await getTokenFromPage(page)
expect(token).toBeNull()
```

### localStorage & sessionStorage

```typescript
// Verify data in localStorage
const storageData = await page.evaluate(() => {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) data[key] = localStorage.getItem(key) || ''
  }
  return data
})
expect(storageData['auth_token']).toBeTruthy()
```

## Accessibility Patterns

Always include accessibility tests for form interactions:

```typescript
test('Scenario: Form is keyboard navigable', async ({ page }) => {
  await page.goto('/login')

  // Tab to first input
  await page.keyboard.press('Tab')
  await page.keyboard.type('test@example.com')

  // Tab to password
  await page.keyboard.press('Tab')
  await page.keyboard.type('password')

  // Tab to submit button
  await page.keyboard.press('Tab')

  // Verify button is focused
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
  expect(focusedElement).toBe('BUTTON')
})
```

## Browser-Specific Patterns

Tests run on both Chromium and Firefox. Use patterns that work on both:

```typescript
// ✅ GOOD - Works on both browsers
await page.click('button:has-text("Click me")')
await page.fill('input[type="email"]', 'test@example.com')

// ⚠️ CAUTION - Firefox may behave differently
// Use .evaluate() for browser-specific code if needed
await page.evaluate(() => {
  // Firefox-safe code here
})
```

## Common Pitfalls to Avoid

1. **Race conditions** - Always wait for network, elements, or conditions before asserting
   ```typescript
   // ❌ WRONG - May not wait for data
   await page.goto('/browse')
   await expect(page.locator('.tournament')).toBeVisible()
   
   // ✅ RIGHT - Waits for network
   await page.goto('/browse', { waitUntil: 'networkidle' })
   await expect(page.locator('.tournament')).toBeVisible()
   ```

2. **Hard-coded test data** - Creates conflicts in parallel runs
   ```typescript
   // ❌ WRONG
   const email = 'test@example.com'
   
   // ✅ RIGHT
   const email = `test-${Date.now()}@example.com`
   ```

3. **Brittle selectors** - Break when UI changes
   ```typescript
   // ❌ WRONG - Specific order/structure dependent
   await page.click('div:nth-child(3) > button')
   
   // ✅ RIGHT - Semantic and resilient
   await page.click('button:has-text("Register")')
   ```

4. **Unclear test purpose** - Makes maintenance difficult
   ```typescript
   // ❌ WRONG - What is this testing?
   test('should work', async ({ page }) => { ... })
   
   // ✅ RIGHT - Clear requirement reference
   test('Scenario: User can register for tournament', async ({ page }) => { ... })
   ```

5. **Over-specific waits** - Makes tests flaky
   ```typescript
   // ❌ WRONG - Too specific, breaks with UI changes
   await expect(page.locator('.success-banner')).toBeVisible()
   
   // ✅ RIGHT - Flexible, checks for intent not implementation
   await expect(page.locator('text=/success|created|registered/i')).toBeVisible()
   ```

## File Organization by Phase

Create one test file per feature group, organized by phase:

```
packages/frontend/e2e/
├── auth.spec.ts                    # Phase 1: Authentication (27 scenarios)
├── tournament-discovery.spec.ts    # Phase 2: Tournament Discovery (9 scenarios)
├── group-stage-singles.spec.ts     # Phase 3: Group Stage Singles (10 scenarios)
├── group-stage-doubles.spec.ts     # Phase 4: Group Stage Doubles (4 scenarios)
├── partner-confirmation.spec.ts    # Phase 5: Partner Confirmation (5 scenarios)
├── bracket-singles.spec.ts         # Phase 6: Bracket Singles (3 scenarios)
├── bracket-doubles.spec.ts         # Phase 7: Bracket Doubles (2 scenarios)
├── real-time-updates.spec.ts       # Phase 8: Real-Time Updates (4 scenarios)
├── offline-error.spec.ts           # Phase 9: Offline & Error (4 scenarios)
├── mobile-responsive.spec.ts       # Phase 10: Mobile & Responsive (4 scenarios)
└── README.md                       # This file
```

## Quick Checklist for New Test Files

When implementing a new phase, ensure:

- [ ] Import test, expect from @playwright/test
- [ ] Define API_BASE constant
- [ ] Include all 4 helper functions (apiCall, getTokenFromPage, clearAuthState, createTest*)
- [ ] Use test.beforeEach() to clear auth state
- [ ] Name tests: `Scenario: [matching e2e-scenarios.md]`
- [ ] Include Given/When/Then comments
- [ ] Use flexible URL matchers with regex: `/\/path1|\/path2/`
- [ ] Use network waits: `{ waitUntil: 'networkidle' }`
- [ ] Create unique test data with Date.now()
- [ ] Use semantic selectors: `button:has-text("...")` not `div:nth-child(3)`
- [ ] Verify via assertions, not UI text (when possible)
- [ ] Test on both browsers (Chromium + Firefox) - Playwright runs both by default

## Phase Implementation Order

1. **Phase 1: Authentication** ✅ Complete (uses all patterns established here)
2. **Phase 2-10:** Follow the same structure and patterns

Each phase should:
- Create a new `.spec.ts` file in `packages/frontend/e2e/`
- Include all helper functions and boilerplate
- Follow Given/When/Then structure
- Map 1:1 to scenarios in `e2e-scenarios.md`
- Run with: `npm run test:e2e` (all) or `npx playwright test --grep "Feature: X"` (specific)
