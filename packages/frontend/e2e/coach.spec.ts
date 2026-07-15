/**
 * 1:1 Coach — E2E tests (S10.1)
 *
 * Backend runs ASSISTANT_ADAPTER=mock (default) — MockCoachClient (§0.8)
 * fakes only the NL→intent hop; every tool it calls is real. Coach is
 * account-holders-only, so these specs sign up via the real /api/auth/signup
 * flow (not the /test/player-token magic-link shortcut used by group Coach
 * e2e), matching profile.spec.ts's pattern.
 *
 * See e2e-scenarios.md "1:1 Coach" for the scenario list this implements.
 * Run: npx playwright test coach
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

async function sendCoachMessage(page: any, body: string) {
  await page.fill(SELECTORS.COACH_MESSAGE_INPUT, body)
  await page.click(SELECTORS.COACH_MESSAGE_SEND_BUTTON)
}

test.describe('1:1 Coach', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('first open: pinned Coach entry (incl. zero-group player) shows the intro message', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)

    await page.goto('http://localhost:5173/groups')
    await expect(page.locator(SELECTORS.COACH_ENTRY)).toBeVisible()
    await page.click(SELECTORS.COACH_ENTRY)

    await expect(page).toHaveURL(/\/coach/)
    await expect(page.locator(SELECTORS.COACH_CHAT_PAGE)).toBeVisible()
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE)).toContainText(/Coach/, { timeout: 8000 })
  })

  test('turn loop: a message gets a reply without reload', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)
    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).first()).toBeVisible({ timeout: 8000 })

    await sendCoachMessage(page, 'hello')

    await expect(page.locator(SELECTORS.COACH_PLAYER_BUBBLE)).toContainText('hello')
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE)).toHaveCount(2, { timeout: 8000 })
  })

  test('medical decline is exact and unconditional', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)
    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).first()).toBeVisible({ timeout: 8000 })

    await sendCoachMessage(page, 'my elbow hurts when I serve')

    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).last()).toContainText(
      "That's one for a physio or doctor",
      { timeout: 8000 }
    )
  })

  test('NEGATIVE — Coach never writes to a group on the player\'s behalf', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)
    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).first()).toBeVisible({ timeout: 8000 })

    await sendCoachMessage(page, 'submit my score 2-1')

    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).last()).toContainText(
      /group chat/i,
      { timeout: 8000 }
    )
  })

  test('remember flow: propose -> confirm -> memory in Profile -> delete', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)
    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).first()).toBeVisible({ timeout: 8000 })

    await sendCoachMessage(page, 'remember I prefer morning matches')

    await expect(page.locator(SELECTORS.ACTION_CARD)).toBeVisible({ timeout: 8000 })
    await page.click(SELECTORS.ACTION_CARD_CONFIRM_BUTTON)
    await expect(page.locator(SELECTORS.ACTION_CARD_STATUS)).toContainText('Confirmed', { timeout: 8000 })

    await page.goto(`http://localhost:5173${ROUTES.PROFILE}`)
    await expect(page.getByText('I prefer morning matches')).toBeVisible({ timeout: 8000 })

    await page.click(SELECTORS.MEMORY_DELETE)
    await expect(page.getByText('prefers morning matches')).not.toBeVisible({ timeout: 8000 })
  })

  test('memory toggle off suppresses the propose flow', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)

    await page.goto(`http://localhost:5173${ROUTES.PROFILE}`)
    await expect(page.locator(SELECTORS.COACH_MEMORY_TOGGLE)).toBeVisible({ timeout: 8000 })
    await page.click(SELECTORS.COACH_MEMORY_TOGGLE)
    await expect(page.locator(SELECTORS.COACH_MEMORY_TOGGLE)).not.toBeChecked()

    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).first()).toBeVisible({ timeout: 8000 })
    await sendCoachMessage(page, 'remember I prefer morning matches')

    await expect(page.locator(SELECTORS.ACTION_CARD)).not.toBeVisible({ timeout: 4000 })
  })

  test('clear conversation resets the thread but not memories', async ({ page }) => {
    const user = createTestUser()
    await signupViaApi(user)
    await loginFrontend(page, user)
    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE).first()).toBeVisible({ timeout: 8000 })
    await sendCoachMessage(page, 'hello')
    await expect(page.locator(SELECTORS.COACH_PLAYER_BUBBLE)).toBeVisible({ timeout: 8000 })

    await page.goto(`http://localhost:5173${ROUTES.PROFILE}`)
    await page.click(SELECTORS.COACH_CLEAR)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.click(SELECTORS.COACH_CLEAR_CONFIRM)

    await page.goto(`http://localhost:5173${ROUTES.COACH}`)
    await expect(page.locator(SELECTORS.COACH_PLAYER_BUBBLE)).toHaveCount(0)
    await expect(page.locator(SELECTORS.COACH_ASSISTANT_BUBBLE)).toHaveCount(1, { timeout: 8000 })
  })

  // DobScreen's own link-to-/privacy wiring is covered directly by
  // DobScreen.spec.tsx (RTL) — driving the full multi-step signup flow here
  // just to re-click the same link would be redundant and fragile.
  test('privacy page is reachable logged-out', async ({ page }) => {
    await page.goto(`http://localhost:5173${ROUTES.PRIVACY}`)
    await expect(page.locator(SELECTORS.PRIVACY_POLICY_PAGE)).toBeVisible()
  })
})
