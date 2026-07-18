/**
 * Feature: PWA Venue Mode (Offline) — installability (e2e-scenarios.md)
 *
 * Scenario: "Installable".
 *
 * Runs only on the `pwa` Playwright project (chromium, preview build @ :4173).
 * Requires the API on :3001 and `npm run preview:pwa` already running.
 */

import { test, expect } from '@playwright/test'
import {
  getOrganizerToken,
  createSinglesTournamentInGroupStage,
  waitForServiceWorkerReady,
  waitForControllingServiceWorker,
} from './fixtures'
import { API_CONFIG } from './config'

async function apiRunning(): Promise<boolean> {
  try {
    return (await fetch(`${API_CONFIG.BASE_URL}/health`)).ok
  } catch {
    return false
  }
}

test.describe('Feature: PWA Venue Mode (Offline) — installability', () => {
  test.beforeEach(async () => {
    if (!(await apiRunning())) test.skip()
  })

  test('Scenario: manifest.webmanifest is served with the required PWA fields', async ({ page }) => {
    const response = await page.request.get('/manifest.webmanifest')
    expect(response.ok()).toBe(true)

    const manifest = await response.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.scope).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBeTruthy()
    expect(manifest.background_color).toBeTruthy()
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose?.includes('maskable'))).toBe(true)
  })

  test('Scenario: the service worker registers and controls the page', async ({ page }) => {
    const organizerToken = await getOrganizerToken()
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)

    const controllerScriptUrl = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null
    )
    expect(controllerScriptUrl).toContain('/service-worker.js')
  })
})
