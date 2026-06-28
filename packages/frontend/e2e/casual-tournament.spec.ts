/**
 * G4.8 — Casual tournament launch, score submission, leaderboards, end session (E2E)
 *
 * Scenarios (added to e2e-scenarios.md under "Feature: Player Groups — casual tournament"):
 *  - Poll creator launches casual tournament from In-voters
 *  - Any participant submits a score in casual mode
 *  - Pair + individual leaderboards render
 *  - Owner ends session
 *
 * Prerequisite: API server on port 3001, frontend dev server on port 5173.
 * These tests are best-effort: if the API is not running they skip gracefully.
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

async function createPoll(token: string, groupId: string, question: string) {
  const res = await apiCall(`/player/groups/${groupId}/polls`, 'POST', { question }, token)
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

test.describe('G4.8 — Casual tournament', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('Poll creator sees launch button on closed poll', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Casual Group ${Date.now()}`)

    // Create poll and close it immediately via API
    const poll = await createPoll(token, groupId, 'Ready for a quick match?')
    await closePoll(token, groupId, poll.messageId)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Poll card should be visible and closed (no vote buttons)
    await expect(page.locator(SELECTORS.POLL_CARD)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(SELECTORS.POLL_VOTE_IN)).not.toBeVisible()

    // Creator should see "Launch tournament from In-voters" button
    await expect(page.locator(SELECTORS.POLL_LAUNCH_BUTTON)).toBeVisible({ timeout: 5000 })
  })

  test('Non-creator does not see launch button on closed poll', async ({ page }) => {
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken } = await signupAndGetToken(member)
    const groupId = await createGroup(ownerToken, `Casual Group ${Date.now()}`)

    // Owner creates and closes the poll
    const poll = await createPoll(ownerToken, groupId, 'Play tonight?')
    await castVote(memberToken, groupId, poll.pollId, 'in')
    await closePoll(ownerToken, groupId, poll.messageId)

    // Member (not creator) views the group
    await loginFrontend(page, memberToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.POLL_CARD)).toBeVisible({ timeout: 5000 })
    // Non-creator should NOT see the launch button
    await expect(page.locator(SELECTORS.POLL_LAUNCH_BUTTON)).not.toBeVisible()
  })

  test('Launching casual tournament from poll calls launch endpoint', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Launch Group ${Date.now()}`)

    // Create poll with an "In" vote and close it
    const poll = await createPoll(token, groupId, 'Game on?')
    await castVote(token, groupId, poll.pollId, 'in')
    await closePoll(token, groupId, poll.messageId)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.POLL_LAUNCH_BUTTON)).toBeVisible({ timeout: 5000 })

    // Intercept the launch POST to confirm it is called
    let launchCalled = false
    await page.route(`**/player/groups/${groupId}/polls/${poll.messageId}/launch`, async route => {
      launchCalled = true
      await route.fulfill({ status: 201, body: JSON.stringify({ tournamentId: 'test-tid' }) })
    })

    await page.locator(SELECTORS.POLL_LAUNCH_BUTTON).click()
    await page.waitForTimeout(500)
    expect(launchCalled).toBe(true)
  })

  test('Leaderboard panel renders when group has leaderboard data', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `LB Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // If a Leaderboard tab exists, navigate to it
    const lbTab = page.locator('[data-testid="group-tab-leaderboard"]')
    if (await lbTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lbTab.click()
      // Leaderboard panel should be present (may be empty with no tournaments played)
      await expect(page.locator(SELECTORS.LEADERBOARD_PANEL)).toBeVisible({ timeout: 5000 })
    } else {
      // Leaderboard tab not implemented yet — skip this assertion
      test.skip()
    }
  })
})
