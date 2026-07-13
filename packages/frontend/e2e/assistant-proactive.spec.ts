/**
 * LLM Assistant (@coach) — Phase C proactive E2E tests (deadline nudges, T3.1)
 *
 * Backend must run ASSISTANT_ADAPTER=mock (default) + JOB_QUEUE=memory
 * (default) — see e2e-scenarios.md "LLM Assistant (@coach) — Phase C
 * proactive (nudges, recap, digest)", which these specs implement.
 *
 * The nudge sweep is driven synchronously via the NODE_ENV!=production
 * /test/nudge-sweep trigger endpoint (A8 /test/casual-session precedent) —
 * no real time passes and no BullMQ cron tick is needed in a browser test.
 *
 * Run: npx playwright test assistant-proactive
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

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

// ── Helpers (mirrors assistant-actions.spec.ts) ─────────────────────────────

async function signupAndGetToken(user: { email: string; name: string; password: string }) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name })
  if (!res.ok) throw new Error(`player-token failed: ${await res.text()}`)
  const data = await res.json()
  return { token: data.playerToken as string, playerId: data.playerId as string }
}

async function createGroup(token: string, name: string): Promise<string> {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

async function seedScheduledSession(
  groupId: string,
  playerIds: string[],
  hoursUntilDeadline: number
): Promise<string> {
  const res = await apiCall('/test/scheduled-session', 'POST', { groupId, playerIds, hoursUntilDeadline })
  if (!res.ok) throw new Error(`scheduled-session seed failed: ${await res.text()}`)
  const data = await res.json()
  return data.tournamentId as string
}

async function runNudgeSweep(): Promise<void> {
  const res = await apiCall('/test/nudge-sweep', 'POST')
  if (!res.ok) throw new Error(`nudge-sweep trigger failed: ${await res.text()}`)
}

async function setAssistantEnabled(groupId: string, token: string, enabled: boolean): Promise<void> {
  const res = await apiCall(`/player/groups/${groupId}`, 'PATCH', { assistantEnabled: enabled }, token)
  if (!res.ok) throw new Error(`assistant toggle failed: ${await res.text()}`)
}

async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

test.describe('LLM Assistant (@coach) — Phase C proactive nudges', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('48h nudge names the unscored match', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Nudge 48h Group ${Date.now()}`)
    await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 47)

    await runNudgeSweep()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toContainText(opponent.name)
  })

  test('24h nudge fires independently of the 48h nudge', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Nudge 24h Group ${Date.now()}`)
    await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 23)

    // A deadline 23h out is already inside both the 48h and 24h windows — a
    // single sweep posts both milestone nudges in the same pass (a late sweep
    // still catches an unposted 48h nudge too).
    await runNudgeSweep()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(2, { timeout: 8000 })
  })

  test('nothing unscored → no nudge', async ({ page }) => {
    const owner = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const groupId = await createGroup(ownerToken, `Nudge Nothing Group ${Date.now()}`)
    // No scheduled session seeded at all — nothing due, nothing to nudge about.

    await runNudgeSweep()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(0)
  })

  test('assistant disabled → no nudge', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Nudge Disabled Group ${Date.now()}`)
    await setAssistantEnabled(groupId, ownerToken, false)
    await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 47)

    await runNudgeSweep()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(0)
  })

  test('sweeping twice posts only once (idempotent)', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Nudge Idempotent Group ${Date.now()}`)
    await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 47)

    await runNudgeSweep()
    await runNudgeSweep()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(1, { timeout: 8000 })
  })

  test('a third proactive post in the same day is cap-suppressed', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const carol = { ...createTestUser(), name: `Carol ${Date.now()}` }
    const dave = { ...createTestUser(), name: `Dave ${Date.now()}` }
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const { playerId: carolId } = await signupAndGetToken(carol)
    const { playerId: daveId } = await signupAndGetToken(dave)
    const groupId = await createGroup(ownerToken, `Nudge Cap Group ${Date.now()}`)

    // Three independent tournaments, each due for its own 48h nudge — the
    // group-wide cap (≤2 proactive posts/day) should suppress the third.
    await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 47)
    await seedScheduledSession(groupId, [ownerPlayerId, carolId], 47)
    await seedScheduledSession(groupId, [ownerPlayerId, daveId], 47)

    await runNudgeSweep()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(2, { timeout: 8000 })
  })
})
