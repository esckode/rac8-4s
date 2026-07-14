/**
 * Player Personalization (P2/P3/P4) — FE quick wins E2E tests
 *
 * See e2e-scenarios.md "Player Personalization (P0-P12)" scenarios (3)-(5).
 * Players authenticate with a magic-link player-session token (not an
 * account login) — same model as group-stage-singles-player.spec.ts.
 *
 * Run: npx playwright test personalization-ui
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

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

async function signupAndGetToken(user: { email: string; name: string; password: string }, tournamentId?: string) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name, tournamentId })
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

async function seedScheduledSession(groupId: string, playerIds: string[], hoursUntilDeadline: number): Promise<string> {
  const res = await apiCall('/test/scheduled-session', 'POST', { groupId, playerIds, hoursUntilDeadline })
  if (!res.ok) throw new Error(`scheduled-session seed failed: ${await res.text()}`)
  const data = await res.json()
  return data.tournamentId as string
}

async function loginFrontend(page: any, token: string) {
  await page.addInitScript((t: string) => {
    localStorage.setItem('auth_token', t)
  }, token)
}

test.describe('Player Personalization — FE quick wins', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('standings highlights and scrolls to the viewer\'s own row', async ({ page }) => {
    const owner = createTestUser()
    const p2 = createTestUser()
    const p3 = createTestUser()
    const p4 = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: p2Id } = await signupAndGetToken(p2)
    const { playerId: p3Id } = await signupAndGetToken(p3)
    const { playerId: p4Id } = await signupAndGetToken(p4)
    const groupId = await createGroup(ownerToken, `Standings UI Group ${Date.now()}`)
    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, p2Id, p3Id, p4Id], 200)
    // Player sessions are scoped to a tournamentId claim (assertPlayerInTournament);
    // re-mint the owner's token now that the real tournament exists.
    const { token: scopedOwnerToken } = await signupAndGetToken(owner, tournamentId)

    await loginFrontend(page, scopedOwnerToken)
    await page.goto(`/tournament/${tournamentId}/standings`)

    await expect(page.locator(SELECTORS.STANDINGS_TABLE)).toBeVisible()
    await expect(page.locator(SELECTORS.STANDINGS_ROW_YOU)).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.STANDINGS_ROW_YOU)).toContainText(/you/i)
  })

  test('chat shows initials avatars with stable colors across reload', async ({ page }) => {
    const owner = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const groupId = await createGroup(ownerToken, `Avatar UI Group ${Date.now()}`)

    await apiCall(`/player/groups/${groupId}/messages`, 'POST', { body: 'hello there' }, ownerToken)

    await loginFrontend(page, ownerToken)
    await page.goto(`/groups/${groupId}`)

    const avatar = page.locator(SELECTORS.AVATAR).first()
    await expect(avatar).toBeVisible({ timeout: 8000 })
    const colorBefore = await avatar.evaluate(el => getComputedStyle(el).backgroundColor)

    await page.reload()
    const avatarAfter = page.locator(SELECTORS.AVATAR).first()
    await expect(avatarAfter).toBeVisible({ timeout: 8000 })
    const colorAfter = await avatarAfter.evaluate(el => getComputedStyle(el).backgroundColor)

    expect(colorAfter).toBe(colorBefore)
  })

  test('deadline shows an absolute time with a relative phrase secondary', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Deadline UI Group ${Date.now()}`)
    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 47)
    const { token: scopedOwnerToken } = await signupAndGetToken(owner, tournamentId)

    await loginFrontend(page, scopedOwnerToken)
    await page.goto(`/tournament/${tournamentId}/details`)

    await expect(page.locator(SELECTORS.DEADLINE_VALUE).first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.DEADLINE_RELATIVE).first()).toContainText(/in \d+ (day|hour|minute)s?/)
  })
})
