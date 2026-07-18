/**
 * Feature: PWA Venue Mode (Offline) — venue views + app shell (e2e-scenarios.md)
 *
 * Scenarios: "Venue views readable offline", "App shell boots offline (preview build only)".
 *
 * Runs only on the `pwa` Playwright project (chromium, preview build @ :4173) — see
 * PWA_CACHING_IMPLEMENTATION.md §0.8. Requires the API on :3001 and
 * `npm run preview:pwa` already running (no webServer is configured for this project).
 */

import { test, expect } from '@playwright/test'
import {
  getOrganizerToken,
  createSinglesTournamentInGroupStage,
  waitForServiceWorkerReady,
  waitForControllingServiceWorker,
  goOffline,
  goOnline,
} from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

async function apiRunning(): Promise<boolean> {
  try {
    return (await fetch(`${API_CONFIG.BASE_URL}/health`)).ok
  } catch {
    return false
  }
}

test.describe('Feature: PWA Venue Mode (Offline) — venue views + app shell', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  test.beforeEach(async () => {
    if (!(await apiRunning())) test.skip()
  })

  test('Scenario: Venue views readable offline', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    // First navigation installs the SW but does not control this document (D9 — no
    // clients.claim()). Reload once the SW is active so the tab becomes controlled.
    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)

    // Warm all three venue tabs online so their data gets cached.
    await page.goto(`/tournament/${fixture.tournamentId}/standings`)
    await expect(page.locator(SELECTORS.STANDINGS_TABLE)).toBeVisible()
    await page.goto(`/tournament/${fixture.tournamentId}/bracket`)
    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()

    await goOffline(page)

    // Matches
    await page.reload()
    await expect(page.locator(SELECTORS.OFFLINE_BANNER)).toBeVisible()
    await expect(page.locator(SELECTORS.SNAPSHOT_UPDATED_AT).first()).toBeVisible()
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()

    // Standings
    await page.goto(`/tournament/${fixture.tournamentId}/standings`)
    await expect(page.locator(SELECTORS.OFFLINE_BANNER)).toBeVisible()
    await expect(page.locator(SELECTORS.SNAPSHOT_UPDATED_AT).first()).toBeVisible()
    await expect(page.locator(SELECTORS.STANDINGS_TABLE)).toBeVisible()

    // Bracket (group stage — bracket itself may be pending, but the view must
    // still boot from the snapshot rather than showing an error).
    await page.goto(`/tournament/${fixture.tournamentId}/bracket`)
    await expect(page.locator(SELECTORS.OFFLINE_BANNER)).toBeVisible()
    await expect(page.locator(SELECTORS.SNAPSHOT_UPDATED_AT).first()).toBeVisible()
    await expect(page.locator(SELECTORS.ERROR_STATE)).toHaveCount(0)
  })

  test('Scenario: App shell boots offline (preview only)', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)
    // Wait for the bundle fetch to actually complete (and get cached) before
    // going offline — otherwise it's still in flight when the next reload
    // abandons it, leaving nothing for the fallback to serve.
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()

    await goOffline(page)

    // Hard reload while offline — the precached app shell (not a browser error
    // page) must boot the SPA.
    await page.reload()
    await expect(page.locator('#root')).not.toBeEmpty()
    await expect(page.locator(SELECTORS.OFFLINE_BANNER)).toBeVisible()
  })

  test('Scenario: Offline reload keeps the session (D11) — magic-link player', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()

    await goOffline(page)
    await page.reload()

    // Stays signed in offline — no redirect to /login — and the snapshot renders.
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator(SELECTORS.OFFLINE_BANNER)).toBeVisible()
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()

    await goOnline(page)
    await page.reload()

    // Revalidates on reconnect — no re-login required.
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator(SELECTORS.BRACKET_MATCHES).first()).toBeVisible()
  })

  test('Scenario: Offline reload keeps the session (D11) — registered account', async ({ page }) => {
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, organizerToken)

    await page.goto('/organizer')
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)
    await expect(page).not.toHaveURL(/\/login/)

    await goOffline(page)
    await page.reload()

    // Stays signed in offline — no redirect to /login.
    await expect(page).not.toHaveURL(/\/login/)

    await goOnline(page)
    await page.reload()

    // Revalidates on reconnect — no re-login required.
    await expect(page).not.toHaveURL(/\/login/)
  })
})
