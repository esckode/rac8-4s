// ============================================================================
// E2E Test Template - Copy this file and modify for new feature groups
// See README.md for detailed pattern documentation
// ============================================================================

import { test, expect } from '@playwright/test'
import { API_CONFIG, ROUTES, API_ENDPOINTS, TIMEOUTS, TEST_DATA, SELECTORS, UI_TEXT } from './config'

// Make API calls (use for test preconditions)
async function apiCall(path: string, method: string, body?: unknown) {
  const response = await fetch(`${API_CONFIG.BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

// ============================================================================
// TODO: Update this to match your feature group
// ============================================================================

test.describe('Feature Group Name E2E', () => {
  // Run before each test - clear auth state and navigate to baseline
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await clearAuthState(page)
  })

  // ========================================================================
  // Feature Group 1 - Update feature name to match e2e-scenarios.md
  // ========================================================================

  test.describe('Feature: Feature Group Name 1', () => {
    test('Scenario: First scenario name from e2e-scenarios.md', async ({ page }) => {
      // Given: [Initial state]
      const user = createTestUser()
      await apiCall('/api/auth/signup', 'POST', {
        email: user.email,
        name: user.name,
        password: user.password,
      })

      // When: [User action]
      await page.goto('/some-page', { waitUntil: 'networkidle' })

      // Then: [Expected outcome]
      await expect(page.locator('text=Success')).toBeVisible()
    })

    test('Scenario: Second scenario name from e2e-scenarios.md', async ({ page }) => {
      // Given: [Initial state]

      // When: [User action]

      // Then: [Expected outcome]
    })

    // Add more tests for this feature group...
  })

  // ========================================================================
  // Feature Group 2 - Update feature name to match e2e-scenarios.md
  // ========================================================================

  test.describe('Feature: Feature Group Name 2', () => {
    test('Scenario: Scenario name from e2e-scenarios.md', async ({ page }) => {
      // Given: [Initial state]

      // When: [User action]

      // Then: [Expected outcome]
    })

    // Add more tests for this feature group...
  })

  // ========================================================================
  // Additional Feature Groups (repeat pattern above)
  // ========================================================================

  // Copy the pattern above for each feature group in this test file
})

// ============================================================================
// INSTRUCTIONS
// ============================================================================
//
// 1. Replace "Feature Group Name" with your actual feature group name
//    (from e2e-scenarios.md, e.g., "Tournament Discovery & Registration")
//
// 2. For each scenario in e2e-scenarios.md:
//    - Create a test block with exact scenario name
//    - Include Given/When/Then comments
//    - Use helper functions for setup (apiCall, createTestUser)
//    - Use semantic selectors (button:has-text, input[type="email"])
//    - Use flexible URL matching: /\/path1|\/path2/
//    - Wait for network: { waitUntil: 'networkidle' }
//
// 3. Use unique test data to avoid conflicts:
//    ✅ const email = `test-${Date.now()}@example.com`
//    ❌ const email = 'test@example.com'
//
// 4. For element selectors, prefer (in order):
//    ✅ button:has-text("Text")
//    ✅ input[type="email"]
//    ✅ [data-testid="id"]
//    ✅ [aria-label="label"]
//    ❌ div:nth-child(3)
//    ❌ .class-name (unless stable)
//
// 5. Use flexible waiting:
//    ✅ await page.goto('/path', { waitUntil: 'networkidle' })
//    ✅ await page.waitForURL(/\/path\//)
//    ✅ await expect(page.locator('...')).toBeVisible()
//    ❌ await page.goto('/path')
//    ❌ await page.waitForTimeout(2000)
//
// 6. Name file matching test content:
//    e.g., tournament-discovery.spec.ts, group-stage-singles.spec.ts
//
// 7. Run tests:
//    npm run test:e2e:your-phase  (if npm script added)
//    npx playwright test your-file.spec.ts --ui
//    npx playwright test --grep "Feature: Your Feature"
//
// See packages/frontend/e2e/README.md for detailed patterns and examples
// ============================================================================
