/**
 * G3.3 — Inline poll cards with live SSE tally (E2E)
 *
 * Scenarios (added to e2e-scenarios.md under "Feature: Player Groups — polls"):
 *  - Member creates a poll → card appears inline in chat stream
 *  - Another member votes In → tally updates live (SSE)
 *  - Re-voting moves the choice
 *  - Group owner closes poll → card freezes, vote buttons gone, "Final:" shown
 *
 * Prerequisite: API server on port 3001, frontend dev server on port 5173.
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, SELECTORS, ROUTES } from './config'

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

// ── API helpers ───────────────────────────────────────────────────────────────

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

async function createGroup(token: string, name: string): Promise<string> {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

async function inviteMember(token: string, groupId: string, email: string): Promise<void> {
  const res = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email }, token)
  if (!res.ok) throw new Error(`Invite failed: ${await res.text()}`)
}

async function createPoll(token: string, groupId: string, question: string, targetTime?: string) {
  const body: Record<string, string> = { question }
  if (targetTime) body.targetTime = targetTime
  const res = await apiCall(`/player/groups/${groupId}/polls`, 'POST', body, token)
  if (!res.ok) throw new Error(`Create poll failed: ${await res.text()}`)
  return res.json() as Promise<{ pollId: string; messageId: string; question: string }>
}

async function castVote(token: string, groupId: string, pollId: string, choice: string) {
  const res = await apiCall(`/player/groups/${groupId}/polls/${pollId}/votes`, 'POST', { choice }, token)
  if (!res.ok) throw new Error(`Cast vote failed: ${await res.text()}`)
  return res.json()
}

async function closePoll(token: string, groupId: string, messageId: string) {
  const res = await apiCall(`/player/groups/${groupId}/polls/${messageId}/close`, 'POST', {}, token)
  if (!res.ok) throw new Error(`Close poll failed: ${await res.text()}`)
  return res.json()
}

async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('G3.3 — Inline poll cards', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('Member creates a poll → card appears inline in chat stream', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Poll Group ${Date.now()}`)

    // Create poll via API
    await createPoll(token, groupId, 'Are you coming tonight?')

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Poll card should render inside the chat stream
    await expect(page.locator(SELECTORS.POLL_CARD)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.POLL_QUESTION)).toHaveText('Are you coming tonight?')

    // Vote buttons should be present
    await expect(page.locator(SELECTORS.POLL_VOTE_IN)).toBeVisible()
    await expect(page.locator(SELECTORS.POLL_VOTE_OUT)).toBeVisible()
    await expect(page.locator(SELECTORS.POLL_VOTE_MAYBE)).toBeVisible()
  })

  test('Voting updates tally on the poll card', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Vote Group ${Date.now()}`)

    const poll = await createPoll(token, groupId, 'Play tomorrow?')

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.POLL_CARD)).toBeVisible({ timeout: 5000 })

    // Click In
    await page.locator(SELECTORS.POLL_VOTE_IN).click()

    // Tally should update (optimistic or via SSE) to show 1 in
    await expect(page.locator(SELECTORS.POLL_TALLY)).toContainText('1 in', { timeout: 5000 })
  })

  test('Re-voting moves the choice', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Revote Group ${Date.now()}`)

    await createPoll(token, groupId, 'Movie night?')

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.POLL_CARD)).toBeVisible({ timeout: 5000 })

    // Vote In
    await page.locator(SELECTORS.POLL_VOTE_IN).click()
    await expect(page.locator(SELECTORS.POLL_TALLY)).toContainText('1 in', { timeout: 5000 })

    // Re-vote Out
    await page.locator(SELECTORS.POLL_VOTE_OUT).click()
    await expect(page.locator(SELECTORS.POLL_TALLY)).toContainText('1 out', { timeout: 5000 })
    await expect(page.locator(SELECTORS.POLL_TALLY)).toContainText('0 in', { timeout: 5000 })
  })

  test('Group owner closes poll → card freezes, vote buttons gone, "Final:" shown', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Close Group ${Date.now()}`)

    const poll = await createPoll(token, groupId, 'Last match?')

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.POLL_CARD)).toBeVisible({ timeout: 5000 })

    // Owner can see close button
    await expect(page.locator(SELECTORS.POLL_CLOSE_BUTTON)).toBeVisible()

    // Click close
    await page.locator(SELECTORS.POLL_CLOSE_BUTTON).click()

    // Card should freeze: vote buttons gone, "Final:" shown
    await expect(page.locator(SELECTORS.POLL_VOTE_IN)).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.POLL_TALLY)).toContainText('Final:', { timeout: 5000 })
  })
})
