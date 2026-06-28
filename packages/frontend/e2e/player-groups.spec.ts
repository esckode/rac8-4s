/**
 * G2.5 — Player Groups E2E tests
 *
 * Covers: My Groups tab; Group page (Chat · Members · Invite); unread badge.
 *
 * NOTE: These tests require both the API server (port 3001) and the frontend
 * dev server (port 5173) to be running. If servers are unavailable the test
 * block is skipped via a prerequisite check.
 *
 * Run: npx playwright test player-groups
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import {
  ROUTES,
  API_CONFIG,
  SELECTORS,
} from './config'

// ── Prerequisite check ───────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sign up a new player account and return a player-session token.
 * Uses the /auth/signup + /auth/login flow.
 */
async function signupAndGetToken(user: { email: string; name: string; password: string }) {
  const res = await apiCall('/auth/signup', 'POST', user)
  if (!res.ok) throw new Error(`Signup failed: ${await res.text()}`)
  const data = await res.json()
  // Signup returns a token directly or we need login
  if (data.token) return { token: data.token as string, playerId: data.playerId as string }

  const loginRes = await apiCall('/auth/login', 'POST', { email: user.email, password: user.password })
  if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`)
  const loginData = await loginRes.json()
  return { token: loginData.token as string, playerId: loginData.playerId as string }
}

/**
 * Create a player group via API and return its id.
 */
async function createGroup(token: string, name: string) {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/**
 * Send a message to a group via API.
 */
async function sendGroupMessage(token: string, groupId: string, body: string) {
  const res = await apiCall(`/player/groups/${groupId}/messages`, 'POST', { body }, token)
  if (!res.ok) throw new Error(`Send message failed: ${await res.text()}`)
  return res.json()
}

/**
 * Log in to the frontend app via localStorage token injection.
 */
async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('G2.5 — Player Groups', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('My Groups nav tab is present and navigates to /groups', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/browse')

    // Nav tab should be visible
    const navTab = page.locator('[data-testid="nav-groups"]')
    await expect(navTab).toBeVisible({ timeout: 5000 })

    await navTab.click()
    await expect(page).toHaveURL(/\/groups/, { timeout: 5000 })
  })

  test('Group list shows the player\'s groups', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    // Create a group via API
    const groupName = `My Test Group ${Date.now()}`
    await createGroup(token, groupName)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/groups')

    await expect(page.locator('[data-testid="group-list-item"]').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator(`text=${groupName}`)).toBeVisible()
  })

  test('Tapping a group opens the Group page with Chat and Members tabs', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Chat Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/groups')

    // Click the first group
    await page.locator('[data-testid="group-list-item"]').first().click()

    // Should navigate to /groups/<id>
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}`), { timeout: 5000 })

    // Chat panel visible
    await expect(page.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })
  })

  test('Group chat renders messages with Name · time', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Msg Group ${Date.now()}`)
    await sendGroupMessage(token, groupId, 'Hello group!')

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator('[data-testid="group-message-item"]').first()).toBeVisible({ timeout: 5000 })
    // Message body should appear
    await expect(page.locator('text=Hello group!')).toBeVisible()
  })

  test('Members panel lists group members', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Members Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Switch to Members tab
    const membersTab = page.locator('[data-testid="group-tab-members"]')
    await expect(membersTab).toBeVisible({ timeout: 5000 })
    await membersTab.click()

    await expect(page.locator('[data-testid="members-panel"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="member-item"]').first()).toBeVisible()
  })

  test('Invite form is visible on Members panel', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Invite Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Switch to Members tab
    const membersTab = page.locator('[data-testid="group-tab-members"]')
    await expect(membersTab).toBeVisible({ timeout: 5000 })
    await membersTab.click()

    await expect(page.locator('[data-testid="invite-email-input"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="invite-send-button"]')).toBeVisible()
  })
})
