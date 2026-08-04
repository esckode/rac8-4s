/**
 * Player Personalization (P9) — quiet hours E2E test
 *
 * See e2e-scenarios.md "Player Personalization (P0-P12)" scenario (13).
 *
 * ISSUE-66 made quiet hours a stored-but-inert setting: they persist and are
 * editable in Profile, but gate nothing until a device notification channel
 * exists (the only channel today is email, and quiet hours belong client-side
 * once there's a service worker that knows the device's own local time). So
 * this spec proves two things the integration tests can't:
 *   1. the enabled flag + window round-trip through the real Profile UI, and
 *   2. having them enabled and covering "now" suppresses nothing.
 *
 * Run: npx playwright test personalization-quiet-hours
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

async function playerTokenFor(user: { email: string; name: string; password: string }) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name })
  if (!res.ok) throw new Error(`player-token failed: ${await res.text()}`)
  const data = await res.json()
  return { token: data.playerToken as string, playerId: data.playerId as string }
}

async function signupAccount(user: { email: string; name: string; password: string }) {
  const dob = new Date()
  dob.setFullYear(dob.getFullYear() - 25)
  const res = await apiCall('/api/auth/signup', 'POST', {
    email: user.email,
    name: user.name,
    password: user.password,
    dob_attestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
  })
  if (!res.ok) throw new Error(`signup failed: ${await res.text()}`)
  const data = await res.json()
  return { token: data.token as string, playerId: data.user.playerId as string }
}

async function setQuietHoursCoveringNow(accountToken: string): Promise<void> {
  const nowHour = new Date().getUTCHours()
  const res = await apiCall('/api/auth/me/settings', 'PATCH', {
    timezone: 'UTC',
    timezoneManual: true,
    quietHoursEnabled: true,
    quietHoursStart: nowHour,
    quietHoursEnd: (nowHour + 1) % 24,
  }, accountToken)
  if (!res.ok) throw new Error(`quiet-hours PATCH failed: ${await res.text()}`)
}

async function createGroup(token: string, name: string): Promise<string> {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

async function seedScheduledSession(groupId: string, playerIds: string[], hoursUntilDeadline: number): Promise<string> {
  const res = await apiCall('/test/scheduled-session', 'POST', { groupId, playerIds, hoursUntilDeadline })
  if (!res.ok) throw new Error(`scheduled-session seed failed: ${await res.text()}`)
  const data = await res.json()
  return data.tournamentId as string
}

async function runNudgeSweep(): Promise<void> {
  const res = await apiCall('/test/nudge-sweep', 'POST')
  if (!res.ok) throw new Error(`nudge-sweep trigger failed: ${await res.text()}`)
}

async function loginFrontend(page: any, token: string) {
  await page.addInitScript((t: string) => localStorage.setItem('auth_token', t), token)
}

test.describe('Player Personalization — quiet hours (P9, scenario 13)', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('a quiet-hours player still sees their unscored match in pending-actions after a nudge sweep', async ({ page }) => {
    const owner = createTestUser()
    const quietPlayer = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await playerTokenFor(owner)
    const { token: quietAccountToken, playerId: quietPlayerId } = await signupAccount(quietPlayer)
    await setQuietHoursCoveringNow(quietAccountToken)

    const groupId = await createGroup(ownerToken, `Quiet Hours Group ${Date.now()}`)
    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, quietPlayerId], 47)

    await runNudgeSweep()

    await loginFrontend(page, quietAccountToken)
    await page.goto('/browse')

    await expect(page.locator(SELECTORS.NAV_BADGE_MATCHES)).toHaveText('1', { timeout: 8000 })
    const matchLink = page.locator(SELECTORS.UP_NEXT_MATCH)
    await expect(matchLink).toBeVisible()
    await expect(matchLink).toHaveAttribute('href', `/tournament/${tournamentId}/details`)
  })

  // ISSUE-66: the control is inert by design, so the only thing that can break
  // without anyone noticing is persistence — if a PATCH silently stopped
  // storing the flag, no behavior would change today and the regression would
  // surface only once push ships. This pins it.
  test('the quiet-hours toggle and window persist across a reload', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAccount(user)

    await loginFrontend(page, token)
    await page.goto(ROUTES.PROFILE)

    const toggle = page.locator(SELECTORS.QUIET_HOURS_ENABLED)
    await expect(toggle).toBeVisible({ timeout: 8000 })
    await expect(toggle).not.toBeChecked()

    // Off by default, so the window is not editable until it is switched on.
    await expect(page.locator(SELECTORS.QUIET_HOURS_START)).toBeDisabled()

    await toggle.check()
    await page.locator(SELECTORS.QUIET_HOURS_START).selectOption('22')
    await page.locator(SELECTORS.QUIET_HOURS_END).selectOption('7')

    await page.reload()

    await expect(page.locator(SELECTORS.QUIET_HOURS_ENABLED)).toBeChecked({ timeout: 8000 })
    await expect(page.locator(SELECTORS.QUIET_HOURS_START)).toHaveValue('22')
    await expect(page.locator(SELECTORS.QUIET_HOURS_END)).toHaveValue('7')
  })
})
