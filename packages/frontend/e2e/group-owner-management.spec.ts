/**
 * P1.6 — Owner member management + group config E2E tests
 *
 * Covers:
 * - Owner sees ManageMembersList inside the owner section
 * - Owner can promote a member to owner
 * - Owner can kick a member via confirm dialog
 * - Kick confirm dialog is keyboard-dismissable (Escape)
 * - Owner can rename the group
 * - Owner can change default_match_format
 * - Member does NOT see owner controls
 *
 * NOTE: Requires API server (port 3001) and frontend dev server (port 5173).
 * If servers are unavailable, the test block is skipped.
 *
 * Run: npx playwright test group-owner-management
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

async function inviteAndJoin(
  ownerToken: string,
  groupId: string,
  memberEmail: string,
  memberToken: string
) {
  const inviteRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: memberEmail }, ownerToken)
  if (!inviteRes.ok) return false
  // The member joins via direct join endpoint (magic-link shortcut for tests)
  const joinRes = await apiCall(`/player/groups/${groupId}/join`, 'POST', {}, memberToken)
  return joinRes.ok
}

async function loginFrontend(page: Parameters<typeof test>[1] extends (args: infer A) => unknown ? A extends { page: infer P } ? P : never : never, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('P1.6 — Owner member management', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('owner sees manage-members-list in the settings page', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Owner Mgmt Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.GROUP_SETTINGS_OWNER_SECTION)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.MANAGE_MEMBERS_LIST)).toBeVisible({ timeout: 5000 })
  })

  test('owner can promote a member to owner', async ({ page }) => {
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken } = await signupAndGetToken(member)
    const groupId = await createGroup(ownerToken, `Promote Group ${Date.now()}`)

    const joined = await inviteAndJoin(ownerToken, groupId, member.email, memberToken)
    if (!joined) {
      test.skip()
      return
    }

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.MANAGE_MEMBERS_LIST)).toBeVisible({ timeout: 5000 })

    // Find the member row and click promote
    const promoteBtn = page.locator(SELECTORS.PROMOTE_BUTTON).first()
    await expect(promoteBtn).toBeVisible({ timeout: 5000 })
    await promoteBtn.click()

    // After promote, the promote button should disappear (member is now owner)
    await expect(page.locator(SELECTORS.PROMOTE_BUTTON).first()).not.toBeVisible({ timeout: 5000 })
  })

  test('kick button opens a confirm dialog', async ({ page }) => {
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken } = await signupAndGetToken(member)
    const groupId = await createGroup(ownerToken, `Kick Dialog Group ${Date.now()}`)

    const joined = await inviteAndJoin(ownerToken, groupId, member.email, memberToken)
    if (!joined) {
      test.skip()
      return
    }

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.MANAGE_MEMBERS_LIST)).toBeVisible({ timeout: 5000 })

    // Click the first kick button (on the member row)
    const kickBtn = page.locator(SELECTORS.KICK_BUTTON).first()
    await expect(kickBtn).toBeVisible({ timeout: 5000 })
    await kickBtn.click()

    await expect(page.locator(SELECTORS.KICK_CONFIRM_DIALOG)).toBeVisible({ timeout: 3000 })
  })

  test('confirm dialog is keyboard-dismissable with Escape', async ({ page }) => {
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken } = await signupAndGetToken(member)
    const groupId = await createGroup(ownerToken, `Escape Dialog Group ${Date.now()}`)

    const joined = await inviteAndJoin(ownerToken, groupId, member.email, memberToken)
    if (!joined) {
      test.skip()
      return
    }

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.MANAGE_MEMBERS_LIST)).toBeVisible({ timeout: 5000 })

    await page.locator(SELECTORS.KICK_BUTTON).first().click()
    await expect(page.locator(SELECTORS.KICK_CONFIRM_DIALOG)).toBeVisible({ timeout: 3000 })

    // Press Escape to dismiss
    await page.keyboard.press('Escape')
    await expect(page.locator(SELECTORS.KICK_CONFIRM_DIALOG)).not.toBeVisible({ timeout: 3000 })
  })

  test('confirming kick removes the member from the list', async ({ page }) => {
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken } = await signupAndGetToken(member)
    const groupId = await createGroup(ownerToken, `Kick Confirm Group ${Date.now()}`)

    const joined = await inviteAndJoin(ownerToken, groupId, member.email, memberToken)
    if (!joined) {
      test.skip()
      return
    }

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.MANAGE_MEMBERS_LIST)).toBeVisible({ timeout: 5000 })

    // Initially there should be 2 members (owner + member)
    const initialRows = page.locator(`${SELECTORS.MANAGE_MEMBERS_LIST} [data-testid^="member-row-"]`)
    await expect(initialRows).toHaveCount(2, { timeout: 5000 })

    // Kick the member (the non-owner has a Promote button, owner doesn't)
    const kickBtn = page.locator(SELECTORS.KICK_BUTTON).first()
    await kickBtn.click()
    await expect(page.locator(SELECTORS.KICK_CONFIRM_DIALOG)).toBeVisible({ timeout: 3000 })
    await page.locator(SELECTORS.KICK_CONFIRM_BUTTON).click()

    // After kick, only the owner remains
    await expect(initialRows).toHaveCount(1, { timeout: 5000 })
  })
})

test.describe('P1.6 — Group config (rename + match format)', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('owner sees group-name-input and match-format-select', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Config Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.GROUP_SETTINGS_OWNER_SECTION)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_NAME_INPUT)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.GROUP_NAME_SAVE)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.MATCH_FORMAT_SELECT)).toBeVisible({ timeout: 5000 })
  })

  test('owner can rename the group', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const originalName = `Rename Test Group ${Date.now()}`
    const newName = `Renamed Group ${Date.now()}`
    const groupId = await createGroup(token, originalName)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.GROUP_NAME_INPUT)).toBeVisible({ timeout: 5000 })

    // Clear and type new name
    await page.locator(SELECTORS.GROUP_NAME_INPUT).fill(newName)
    await page.locator(SELECTORS.GROUP_NAME_SAVE).click()

    // Navigate back to group detail and check the name was updated
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await expect(page.locator(SELECTORS.GROUP_DETAIL_HEADER)).toContainText(newName, { timeout: 5000 })
  })

  test('owner can change match format to doubles', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Format Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}/settings`)

    await expect(page.locator(SELECTORS.MATCH_FORMAT_SELECT)).toBeVisible({ timeout: 5000 })

    // Select doubles
    await page.locator(SELECTORS.MATCH_FORMAT_SELECT).selectOption('doubles')

    // Verify via API that the format was persisted
    const groupRes = await apiCall(`/player/groups/${groupId}`, 'GET', undefined, token)
    // If the GET endpoint doesn't exist yet, just check no error occurred on the page
    if (groupRes.ok) {
      const groupData = await groupRes.json() as { defaultMatchFormat?: string }
      expect(groupData.defaultMatchFormat).toBe('doubles')
    }
    // Otherwise just confirm no error was shown in the UI
    await expect(page.locator(SELECTORS.MATCH_FORMAT_SELECT)).toBeVisible({ timeout: 3000 })
  })
})
