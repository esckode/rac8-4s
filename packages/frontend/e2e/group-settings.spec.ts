/**
 * P1.4 — Group page header + Group Settings shell E2E tests
 *
 * Covers:
 * - Owner: sees settings gear on group page, navigates to settings, sees owner section
 * - Member: sees settings gear on group page, navigates to settings, owner section NOT visible
 *
 * NOTE: Requires API server (port 3001) and frontend dev server (port 5173).
 * If servers are unavailable, the test block is skipped.
 *
 * Run: npx playwright test group-settings
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

// ── Prerequisite check ────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signupAndGetToken(user: { email: string; name: string; password: string }) {
  const res = await apiCall('/auth/signup', 'POST', user)
  if (!res.ok) throw new Error(`Signup failed: ${await res.text()}`)
  const data = await res.json()
  if (data.token) return { token: data.token as string, playerId: data.playerId as string }

  const loginRes = await apiCall('/auth/login', 'POST', { email: user.email, password: user.password })
  if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`)
  const loginData = await loginRes.json()
  return { token: loginData.token as string, playerId: loginData.playerId as string }
}

async function createGroup(token: string, name: string) {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

async function inviteMember(token: string, groupId: string, email: string) {
  const res = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email }, token)
  if (!res.ok) throw new Error(`Invite failed: ${await res.text()}`)
  return res.json()
}

async function acceptInvite(memberToken: string, groupId: string) {
  // Accept via the API — magic-link acceptance returns a token; here we
  // join via the accept endpoint directly if available, otherwise skip.
  const res = await apiCall(`/player/groups/${groupId}/join`, 'POST', {}, memberToken)
  return res
}

async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('P1.4 — Group Settings (owner flow)', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('owner sees settings gear on the group page', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)
    const groupId = await createGroup(token, `Settings Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.GROUP_DETAIL_HEADER)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_SETTINGS_GEAR)).toBeVisible({ timeout: 5000 })
  })

  test('owner clicks gear and navigates to /groups/:id/settings', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)
    const groupId = await createGroup(token, `Nav Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_SETTINGS_GEAR).click()
    // eslint-disable-next-line security/detect-non-literal-regexp -- groupId is from own fixture
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settings`), { timeout: 5000 })
  })

  test('settings page renders and shows owner section for owner', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)
    const groupId = await createGroup(token, `Owner Settings Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.GROUP_SETTINGS_PAGE)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_SETTINGS_MEMBER_SECTION)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_SETTINGS_OWNER_SECTION)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('P1.4 — Group Settings (member flow)', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('member sees settings gear and settings page hides owner section', async ({ page }) => {
    // Create owner and group
    const ownerUser = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(ownerUser)
    const groupId = await createGroup(ownerToken, `Member Group ${Date.now()}`)

    // Create member account and invite them
    const memberUser = createTestUser()
    const { token: memberToken } = await signupAndGetToken(memberUser)
    await inviteMember(ownerToken, groupId, memberUser.email)

    // Member joins via the join endpoint (or magic link — skip if not available)
    const joinRes = await acceptInvite(memberToken, groupId)
    if (!joinRes.ok) {
      // If join endpoint not yet implemented, mark this sub-scenario as pending
      test.skip()
      return
    }

    await loginFrontend(page, memberToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Gear should be visible for members too
    await expect(page.locator(SELECTORS.GROUP_SETTINGS_GEAR)).toBeVisible({ timeout: 5000 })

    await page.locator(SELECTORS.GROUP_SETTINGS_GEAR).click()
    // eslint-disable-next-line security/detect-non-literal-regexp -- groupId is from own fixture
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settings`), { timeout: 5000 })

    await expect(page.locator(SELECTORS.GROUP_SETTINGS_PAGE)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_SETTINGS_MEMBER_SECTION)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_SETTINGS_OWNER_SECTION)).not.toBeVisible({ timeout: 3000 })
  })
})
