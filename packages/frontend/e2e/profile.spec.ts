/**
 * Player Personalization (P0) — Profile page E2E tests
 *
 * See e2e-scenarios.md "Player Personalization (P0-P12)" scenarios (1)-(2).
 *
 * Run: npx playwright test profile
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, ROUTES, SELECTORS } from './config'

async function serversRunning(): Promise<boolean> {
  try {
    const [api, fe] = await Promise.all([
      fetch(`${API_CONFIG.BASE_URL}/health`).then(r => r.ok),
      fetch('http://localhost:5173').then(r => r.ok),
    ])
    return api && fe
  } catch {
    return false
  }
}

async function signupViaApi(user: { email: string; name: string; password: string }): Promise<void> {
  const dob = new Date()
  dob.setFullYear(dob.getFullYear() - 25)
  const res = await apiCall('/api/auth/signup', 'POST', {
    email: user.email,
    name: user.name,
    password: user.password,
    dob_attestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
  })
  if (!res.ok) throw new Error(`signup failed: ${await res.text()}`)
}

async function loginFrontend(page: any, user: { email: string; password: string }) {
  await page.goto('http://localhost:5173/login')
  await page.fill(SELECTORS.EMAIL_INPUT, user.email)
  await page.fill(SELECTORS.PASSWORD_INPUT, user.password)
  await page.click(SELECTORS.SIGN_IN_BUTTON())
  await page.waitForURL('**/browse', { timeout: 8000 })
}

test.describe('Player Personalization — Profile page', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('profile is reachable from the header and round-trips settings', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)

    await page.click(SELECTORS.NAV_PROFILE)
    await expect(page).toHaveURL(/\/profile/)
    await expect(page.locator(SELECTORS.PROFILE_PAGE)).toBeVisible()

    await page.selectOption(SELECTORS.DENSITY_SELECT, 'compact')
    await page.reload()

    await expect(page.locator(SELECTORS.DENSITY_SELECT)).toHaveValue('compact', { timeout: 8000 })
  })

  test('NEGATIVE — unauthenticated visitor is redirected away from /profile', async ({ page }) => {
    await page.goto(`http://localhost:5173${ROUTES.PROFILE}`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login/)
  })
})
