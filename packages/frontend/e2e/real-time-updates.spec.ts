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
 * is submitted out-of-band via the API (not through the viewer's page), so the
 * only way the viewer learns of the change is the SSE broadcast:
 *   group score submit    → standings.recalculate job → broadcastBus standings.updated
 *   knockout score submit → broadcastBus bracket.updated
 * which the frontend turns into a bundle refetch that re-renders the view.
 *
 * Standings assertions are name-independent: with one match scored exactly one
 * participant has a single win, so the count of wins cells reading "1" goes
 * 0 → 1. Tournaments default to pickleball, so scores use pickleball games.
 */
test.describe('Real-Time Updates', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function inject(page: Page, token: string) {
    await page.addInitScript(t => localStorage.setItem('auth_token', t as string), token)
  }

  // Submit the single group match's score so the focus player wins.
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

  const winsCells = (page: Page) => page.locator(SELECTORS.STANDINGS_WINS)
  const wonCells = (page: Page) => page.locator(SELECTORS.STANDINGS_WINS).filter({ hasText: '1' })

  test('standings update live when another actor submits a score', async ({ page }) => {
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await inject(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/standings`)

    // Baseline: two participants, nobody has a win yet.
    await expect(winsCells(page)).toHaveCount(2)
    await expect(wonCells(page)).toHaveCount(0)

    // A score is submitted out-of-band (not through this page).
    await submitGroupWinForFocus(fx.tournamentId, fx.playerToken, fx.playerId)

    // The table reflects the new standing via SSE, with no manual reload.
    await expect(wonCells(page)).toHaveCount(1, { timeout: 15000 })
  })

  test('multiple connected clients see synchronized standings', async ({ page, browser }) => {
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    // Viewer A: the focus player.
    await inject(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/standings`)
    await expect(wonCells(page)).toHaveCount(0)

    // Viewer B: the organizer, a distinct authenticated client/session.
    const ctxB: BrowserContext = await browser.newContext()
    const pageB = await ctxB.newPage()
    await inject(pageB, organizerToken)
    await pageB.goto(`/tournament/${fx.tournamentId}/standings`)
    await expect(wonCells(pageB)).toHaveCount(0)

    // One score submission should reach both clients.
    await submitGroupWinForFocus(fx.tournamentId, fx.playerToken, fx.playerId)

    await expect(wonCells(page)).toHaveCount(1, { timeout: 15000 })
    await expect(wonCells(pageB)).toHaveCount(1, { timeout: 15000 })

    await ctxB.close()
  })

  test('bracket updates live when a knockout score is submitted', async ({ page }) => {
    const fx = await createTournamentInKnockoutStage(organizerToken, { format: 'singles' })
    expect(fx.knockoutMatch).not.toBeNull()

    // Viewer: the focus participant watching the bracket (the page does not
    // submit — the score arrives via the API below, observed only over SSE).
    // Players see the match-focused bracket (MatchCards), not the organizer tree.
    await inject(page, fx.focusToken)
    await page.goto(`/tournament/${fx.tournamentId}/bracket`)
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()
    await expect(page.getByText('11-9, 11-7')).toHaveCount(0)

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
    await expect(winsCells(page)).toHaveCount(2)
    await expect(wonCells(page)).toHaveCount(0)

    // Drop the network so the EventSource disconnects and the broadcast is missed.
    await context.setOffline(true)
    await submitGroupWinForFocus(fx.tournamentId, fx.playerToken, fx.playerId)

    // The page is still showing stale data while offline.
    await expect(wonCells(page)).toHaveCount(0)

    // On reconnect, the hook refetches the authoritative bundle (no data loss).
    await context.setOffline(false)
    await expect(wonCells(page)).toHaveCount(1, { timeout: 20000 })
  })
})
