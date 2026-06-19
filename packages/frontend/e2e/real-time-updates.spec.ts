import { test, expect, Page, BrowserContext } from '@playwright/test'
import {
  apiCall,
  getOrganizerToken,
  createSinglesTournamentInGroupStage,
  createTournamentInKnockoutStage,
} from './fixtures'
import { SELECTORS } from './config'

/**
 * E2E: Real-Time Updates (SSE).
 *
 * Covers the documented scenarios in e2e-scenarios.md → "Feature: Real-Time
 * Updates (SSE)":
 *   - "User receives live standings update"
 *   - "Multiple users see synchronized standings"
 *   - "User receives live bracket update"
 *   - "User reconnects after SSE disconnect"
 *
 * Each viewer holds an open EventSource on GET /tournaments/:id/events. A score
 * is submitted out-of-band via the API (a different actor than the viewer's
 * page), so the only way the viewer learns of the change is the SSE broadcast:
 *   score submit → standings.recalculate job → broadcastBus standings.updated
 *   knockout score submit → broadcastBus bracket.updated
 * which the frontend turns into a bundle refetch that re-renders the view.
 *
 * Tournaments default to pickleball, so scores use pickleball game scores.
 */
test.describe('Real-Time Updates', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function inject(page: Page, token: string) {
    await page.addInitScript(t => localStorage.setItem('auth_token', t as string), token)
  }

  // Submit the single group match's score so the focus player wins (wins: 1).
  async function submitGroupWinForFocus(tournamentId: string, token: string, focusPlayerId: string) {
    const res = await apiCall(`/tournaments/${tournamentId}/bundle`, 'GET', undefined, token)
    if (!res.ok) throw new Error(`bundle ${res.status}: ${await res.text()}`)
    const bundle = await res.json()
    const match = bundle.matches.group[0]
    const focusIsP1 = match.player1Id === focusPlayerId
    const score = focusIsP1 ? '11-9, 11-7' : '9-11, 7-11'
    const sub = await apiCall(`/tournaments/${tournamentId}/matches/${match.id}/score`, 'POST', { score }, token)
    if (!sub.ok) throw new Error(`score ${sub.status}: ${await sub.text()}`)
  }

  function focusWins(page: Page, focusName: string) {
    return page.locator(SELECTORS.STANDINGS_ROW).filter({ hasText: focusName }).locator(SELECTORS.STANDINGS_WINS)
  }

  test('standings update live when another actor submits a score', async ({ page }) => {
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await inject(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/standings`)

    // Baseline: the focus player has no wins yet.
    await expect(focusWins(page, fx.playerName)).toHaveText('0')

    // A score is submitted out-of-band (not through this page).
    await submitGroupWinForFocus(fx.tournamentId, fx.playerToken, fx.playerId)

    // The table reflects the new standing via SSE, with no manual reload.
    await expect(focusWins(page, fx.playerName)).toHaveText('1', { timeout: 15000 })
  })

  test('multiple connected clients see synchronized standings', async ({ page, browser }) => {
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    // Viewer A: the focus player.
    await inject(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/standings`)
    await expect(focusWins(page, fx.playerName)).toHaveText('0')

    // Viewer B: the organizer, a distinct authenticated client/session.
    const ctxB: BrowserContext = await browser.newContext()
    const pageB = await ctxB.newPage()
    await inject(pageB, organizerToken)
    await pageB.goto(`/tournament/${fx.tournamentId}/standings`)
    await expect(focusWins(pageB, fx.playerName)).toHaveText('0')

    // One score submission should reach both clients.
    await submitGroupWinForFocus(fx.tournamentId, fx.playerToken, fx.playerId)

    await expect(focusWins(page, fx.playerName)).toHaveText('1', { timeout: 15000 })
    await expect(focusWins(pageB, fx.playerName)).toHaveText('1', { timeout: 15000 })

    await ctxB.close()
  })

  test('bracket updates live when a knockout score is submitted', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'singles' })
    expect(fx.knockoutMatch).not.toBeNull()

    // Viewer: the organizer watching the bracket (not the scorer).
    await inject(page, organizerToken)
    await page.goto(`/tournament/${fx.tournamentId}/bracket`)
    await expect(page.locator(SELECTORS.BRACKET_TREE)).toBeVisible()
    await expect(page.getByText('11-9, 11-7')).toHaveCount(0)

    // The focus participant submits their knockout score via the API.
    const sub = await apiCall(
      `/tournaments/${fx.tournamentId}/knockout/${fx.knockoutMatch!.id}/score`,
      'POST',
      { score: '11-9, 11-7' },
      fx.focusToken
    )
    if (!sub.ok) throw new Error(`knockout score ${sub.status}: ${await sub.text()}`)

    // The viewer's bracket reflects the score via SSE, no manual reload.
    await expect(page.getByText('11-9, 11-7')).toBeVisible({ timeout: 15000 })
  })

  test('standings refresh on reconnect after an SSE disconnect', async ({ page, context }) => {
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await inject(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/standings`)
    await expect(focusWins(page, fx.playerName)).toHaveText('0')

    // Drop the network so the EventSource disconnects and the broadcast is missed.
    await context.setOffline(true)
    await submitGroupWinForFocus(fx.tournamentId, fx.playerToken, fx.playerId)

    // The page is still showing stale data while offline.
    await expect(focusWins(page, fx.playerName)).toHaveText('0')

    // On reconnect, the hook refetches the authoritative bundle (no data loss).
    await context.setOffline(false)
    await expect(focusWins(page, fx.playerName)).toHaveText('1', { timeout: 20000 })
  })
})
