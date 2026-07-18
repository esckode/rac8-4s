/**
 * Feature: PWA Venue Mode (Offline) — score sync queue (e2e-scenarios.md)
 *
 * Scenarios: "Offline score submit shows pending, not success", "Reconnect replays
 * the queue", "Replay rejection surfaces and drops", "Non-queueable writes fail
 * fast offline".
 *
 * Runs only on the `pwa` Playwright project (chromium, preview build @ :4173).
 * Requires the API on :3001 and `npm run preview:pwa` already running.
 */

import { test, expect } from '@playwright/test'
import {
  apiCall,
  getOrganizerToken,
  createTestUser,
  createTestTournament,
  createTournamentWithOpenRegistration,
  createSinglesTournamentInGroupStage,
  waitForServiceWorkerReady,
  waitForControllingServiceWorker,
} from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

async function apiRunning(): Promise<boolean> {
  try {
    return (await fetch(`${API_CONFIG.BASE_URL}/health`)).ok
  } catch {
    return false
  }
}

// Two-player singles group-stage match, returning both players' session tokens —
// createSinglesTournamentInGroupStage only surfaces the focus player's token, but
// the replay-rejection scenario needs a second player to score the match first.
async function setupTwoPlayerMatch(organizerToken: string): Promise<{
  tournamentId: string
  matchId: string
  tokenA: string
  tokenB: string
}> {
  const { id: tournamentId } = await createTournamentWithOpenRegistration(
    { ...createTestTournament(), matchFormat: 'singles' },
    organizerToken
  )

  const tokens: string[] = []
  for (const user of [createTestUser(), createTestUser()]) {
    const reg = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', {
      email: user.email,
      name: user.name,
      dob_attestation: { dateOfBirth: '2000-01-01', policyVersion: 'v1' },
    })
    const { magicLinkToken } = await reg.json()
    const verify = await apiCall(
      `/tournaments/${tournamentId}/auth/verify?token=${encodeURIComponent(magicLinkToken)}`,
      'GET'
    )
    const { playerToken } = await verify.json()
    tokens.push(playerToken)
  }

  await apiCall(`/tournaments/${tournamentId}/advance`, 'POST', { action: 'CLOSE_REGISTRATION' }, organizerToken)
  await apiCall(`/tournaments/${tournamentId}/groups`, 'POST', { numGroups: 1, advancingPerGroup: 1 }, organizerToken)

  const matchesRes = await apiCall(`/tournaments/${tournamentId}/matches`, 'GET', undefined, tokens[0])
  const { matches } = await matchesRes.json()

  return { tournamentId, matchId: matches[0].id, tokenA: tokens[0], tokenB: tokens[1] }
}

test.describe('Feature: PWA Venue Mode (Offline) — score sync queue', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  test.beforeEach(async () => {
    if (!(await apiRunning())) test.skip()
  })

  test('Scenario: Offline score submit shows pending, then reconnect replays the queue', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)

    await page.context().setOffline(true)
    await page.reload()

    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()

    // Must render as an explicit pending state — never a silent success.
    await expect(page.locator(SELECTORS.SCORE_PENDING_BADGE)).toBeVisible()
    await expect(page.getByText('11-9, 11-7')).toHaveCount(0)

    await page.context().setOffline(false)

    // Reconnect triggers a queue replay; the badge clears and the real score shows.
    await expect(page.locator(SELECTORS.SCORE_PENDING_BADGE)).toBeHidden({ timeout: 10000 })
    await expect(page.getByText('11-9, 11-7')).toBeVisible()
  })

  test('Scenario: Replay rejection surfaces and drops (no retry)', async ({ page }) => {
    const { tournamentId, matchId, tokenA, tokenB } = await setupTwoPlayerMatch(organizerToken)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, tokenA)

    await page.goto(`/tournament/${tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)

    await page.context().setOffline(true)
    await page.reload()

    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()
    await expect(page.locator(SELECTORS.SCORE_PENDING_BADGE)).toBeVisible()

    // Opponent scores the same match first, while player A is still offline.
    const oppRes = await apiCall(
      `/tournaments/${tournamentId}/matches/${matchId}/score`,
      'POST',
      { score: '6-4, 6-3' },
      tokenB
    )
    expect(oppRes.ok).toBe(true)

    await page.context().setOffline(false)

    // Replay is rejected (already scored) — surfaced, dropped, never retried.
    await expect(page.locator(SELECTORS.SCORE_REJECTED)).toBeVisible({ timeout: 10000 })
    await expect(page.locator(SELECTORS.SCORE_PENDING_BADGE)).toHaveCount(0)
  })

  test('Scenario: Non-queueable writes fail fast offline', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)

    await page.context().setOffline(true)

    const result = await page.evaluate(
      async ({ tournamentId, token }: { tournamentId: string; token: string }) => {
        try {
          const res = await fetch(`/tournaments/${tournamentId}/partner-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ targetPlayerId: 'does-not-matter' }),
          })
          return { ok: res.ok, status: res.status }
        } catch {
          return { ok: false, status: 0 }
        }
      },
      { tournamentId: fixture.tournamentId, token: fixture.playerToken }
    )

    // Must fail like a normal network error — never the synthesized 202 QUEUED shape.
    expect(result.status).not.toBe(202)
    expect(result.ok).toBe(false)
  })
})
