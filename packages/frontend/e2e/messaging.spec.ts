/**
 * E2E: Player Messaging
 *
 * Covers the Gherkin scenarios documented in e2e-scenarios.md → "Feature: Player Messaging":
 *   - Organizer broadcasts an announcement to all participants
 *   - Player sends a coordination message to their match opponent
 *   - Player cannot broadcast to the tournament
 *   - Unread badge updates and clears on read
 *   - Unauthenticated user cannot access messages
 *
 * Seeds its own data via fixtures. Selects elements via data-testid constants from config.ts.
 * Authenticates before visiting auth-gated routes. Uses unique test data to avoid collisions.
 */

import { test, expect } from '@playwright/test'
import {
  apiCall,
  getOrganizerToken,
  createSinglesTournamentInGroupStage,
} from './fixtures'
import { SELECTORS } from './config'

test.describe('Feature: Player Messaging', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function injectToken(page: any, token: string) {
    await page.addInitScript((t: string) => localStorage.setItem('auth_token', t), token)
  }

  // ---------------------------------------------------------------------------
  // Scenario: Organizer broadcasts an announcement to all participants
  // ---------------------------------------------------------------------------
  test('Organizer broadcasts an announcement to all participants', async ({ page }) => {
    // Given: a tournament with a registered participant
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    // Inject the player token so the page authenticates
    await injectToken(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/messages`)

    // Wait for the message panel to render
    await expect(page.locator(SELECTORS.MESSAGE_PANEL)).toBeVisible({ timeout: 10000 })

    // When: the organizer posts an announcement out-of-band
    const annRes = await apiCall(
      `/tournaments/${fx.tournamentId}/announcements`,
      'POST',
      { body: `Announcement-${Date.now()}` },
      organizerToken
    )
    expect(annRes.ok).toBe(true)
    const { message: annMsg } = await annRes.json()

    // Then: the connected participant sees the announcement in real time via SSE
    await expect(
      page.locator(SELECTORS.MESSAGE_ITEM).filter({ hasText: annMsg.body })
    ).toBeVisible({ timeout: 15000 })

    // And: a reconnecting participant sees it in history on reload
    await page.reload()
    await expect(page.locator(SELECTORS.MESSAGE_PANEL)).toBeVisible({ timeout: 10000 })
    await expect(
      page.locator(SELECTORS.MESSAGE_ITEM).filter({ hasText: annMsg.body })
    ).toBeVisible({ timeout: 10000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario: Player sends a coordination message to their match opponent
  // ---------------------------------------------------------------------------
  test('Player sends a coordination message to their match opponent', async ({ page }) => {
    // Given: two players in the same tournament
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    await injectToken(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/messages`)
    await expect(page.locator(SELECTORS.MESSAGE_PANEL)).toBeVisible({ timeout: 10000 })

    // When: the focus player sends a coordination message
    const msgBody = `Coordination-${Date.now()}`
    await page.fill(SELECTORS.MESSAGE_INPUT, msgBody)
    await page.click(SELECTORS.MESSAGE_SEND_BUTTON)

    // Then: the message appears in the panel
    await expect(
      page.locator(SELECTORS.MESSAGE_ITEM).filter({ hasText: msgBody })
    ).toBeVisible({ timeout: 10000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario: Player cannot broadcast to the tournament
  // ---------------------------------------------------------------------------
  test('Player cannot broadcast to the tournament', async ({ page }) => {
    // Given: an authenticated player (not organizer)
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    // API-level: player token rejected with 403
    const apiRes = await apiCall(
      `/tournaments/${fx.tournamentId}/announcements`,
      'POST',
      { body: 'Illegal broadcast' },
      fx.playerToken
    )
    expect(apiRes.status).toBe(403)

    // UI-level: the broadcast button is not visible to a player
    await injectToken(page, fx.playerToken)
    await page.goto(`/tournament/${fx.tournamentId}/messages`)
    await expect(page.locator(SELECTORS.MESSAGE_PANEL)).toBeVisible({ timeout: 10000 })
    await expect(page.locator(SELECTORS.ANNOUNCE_BUTTON)).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Scenario: Unread badge updates and clears on read
  // ---------------------------------------------------------------------------
  test('Unread badge updates and clears on read', async ({ page }) => {
    // Given: a player with one unread message
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    // Organizer sends an announcement that the player hasn't read
    const annRes = await apiCall(
      `/tournaments/${fx.tournamentId}/announcements`,
      'POST',
      { body: `Unread-${Date.now()}` },
      organizerToken
    )
    expect(annRes.ok).toBe(true)

    await injectToken(page, fx.playerToken)
    // Navigate to the tournament detail page (not messages tab yet)
    await page.goto(`/tournament/${fx.tournamentId}/standings`)

    // Then: the unread badge shows a non-zero count
    // The badge is on the Messages tab button
    await expect(page.locator(SELECTORS.UNREAD_BADGE)).toBeVisible({ timeout: 10000 })

    // When: the player opens the message panel (clicks Messages tab)
    await page.click(SELECTORS.MESSAGES_TAB)
    await expect(page.locator(SELECTORS.MESSAGE_PANEL)).toBeVisible({ timeout: 10000 })

    // Then: the badge clears
    await expect(page.locator(SELECTORS.UNREAD_BADGE)).not.toBeVisible({ timeout: 10000 })
  })

  // ---------------------------------------------------------------------------
  // Scenario: Unauthenticated user cannot access messages
  // ---------------------------------------------------------------------------
  test('Unauthenticated user cannot access messages', async ({ page }) => {
    // Given: a tournament exists
    const fx = await createSinglesTournamentInGroupStage(organizerToken, 2)

    // API-level: no auth token → 401
    const apiRes = await apiCall(`/tournaments/${fx.tournamentId}/messages`, 'GET')
    expect(apiRes.status).toBe(401)

    // UI-level: navigating to the messages tab without auth redirects to login
    await page.goto(`/tournament/${fx.tournamentId}/messages`)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})
