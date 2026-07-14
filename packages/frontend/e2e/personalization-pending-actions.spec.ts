/**
 * Player Personalization (P5/P6/P7) — pending-actions FE surfaces E2E tests
 *
 * See e2e-scenarios.md "Player Personalization (P0-P12)" scenarios (6)-(8).
 * Players authenticate with a magic-link player-session token, same model
 * as personalization-ui.spec.ts.
 *
 * Run: npx playwright test personalization-pending-actions
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

async function scoreTheOnlyMatch(tournamentId: string, token: string): Promise<void> {
  const bundleRes = await apiCall(`/tournaments/${tournamentId}/bundle`, 'GET', undefined, token)
  if (!bundleRes.ok) throw new Error(`bundle failed: ${await bundleRes.text()}`)
  const bundle = await bundleRes.json()
  const match = bundle.matches.group[0]
  const res = await apiCall(`/tournaments/${tournamentId}/matches/${match.id}/score`, 'POST', { score: '6-4, 6-3' }, token)
  if (!res.ok) throw new Error(`score submit failed: ${await res.text()}`)
}

async function loginFrontend(page: any, token: string) {
  await page.addInitScript((t: string) => {
    localStorage.setItem('auth_token', t)
  }, token)
}

test.describe('Player Personalization — pending-actions FE surfaces', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('nav badge shows my pending-match count and decreases after I score it', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Badge Group ${Date.now()}`)
    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 200)
    const { token: scopedOwnerToken } = await signupAndGetToken(owner, tournamentId)

    await loginFrontend(page, scopedOwnerToken)
    await page.goto('/browse')

    await expect(page.locator(SELECTORS.NAV_BADGE_MATCHES)).toHaveText('1', { timeout: 8000 })

    await scoreTheOnlyMatch(tournamentId, scopedOwnerToken)
    await page.reload()

    await expect(page.locator(SELECTORS.NAV_BADGE_MATCHES)).not.toBeVisible({ timeout: 8000 })
  })

  test('up-next strip lists my unscored match and deep-links to it; absent once scored', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Strip Group ${Date.now()}`)
    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 200)
    const { token: scopedOwnerToken } = await signupAndGetToken(owner, tournamentId)

    await loginFrontend(page, scopedOwnerToken)
    await page.goto('/browse')

    await expect(page.locator(SELECTORS.UP_NEXT_STRIP)).toBeVisible({ timeout: 8000 })
    const matchLink = page.locator(SELECTORS.UP_NEXT_MATCH)
    await expect(matchLink).toBeVisible()
    await expect(matchLink).toHaveAttribute('href', `/tournament/${tournamentId}/details`)

    await scoreTheOnlyMatch(tournamentId, scopedOwnerToken)
    await page.reload()

    // The tournament's own deadline is still in the future (BE-GAP-2: nothing
    // auto-completes a scheduled tournament), so the strip may legitimately
    // stay up for that reason alone — assert the specific match row is gone,
    // not the whole strip.
    await expect(page.locator(SELECTORS.UP_NEXT_MATCH)).not.toBeVisible({ timeout: 8000 })
  })

  test('composer chip suggests "Report score", disappears once scored, and hides when the assistant is off', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Chip Group ${Date.now()}`)
    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 200)
    const { token: scopedOwnerToken } = await signupAndGetToken(owner, tournamentId)

    await loginFrontend(page, scopedOwnerToken)
    await page.goto(`/groups/${groupId}`)

    const chip = page.locator(SELECTORS.COMPOSER_CHIP)
    await expect(chip).toBeVisible({ timeout: 8000 })
    await expect(chip).toContainText(/report score/i)

    await chip.click()
    await expect(page.locator(SELECTORS.GROUP_MESSAGE_INPUT)).toHaveValue(/^@coach beat /)

    await scoreTheOnlyMatch(tournamentId, scopedOwnerToken)
    await page.reload()
    await expect(chip).not.toContainText(/report score/i, { timeout: 8000 })

    await apiCall(`/player/groups/${groupId}`, 'PATCH', { assistantEnabled: false }, ownerToken)
    await page.reload()
    await expect(chip).not.toBeVisible({ timeout: 8000 })
  })
})
