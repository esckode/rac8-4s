/**
 * Feature: PWA Venue Mode (Offline) — hygiene (e2e-scenarios.md)
 *
 * Scenarios: "Sign-out wipes offline data", "No token-bearing URL is ever cached".
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

// Cache Storage + the score-queue IDB store, read from the page's own origin.
async function readVenueCacheAndQueueState(page: any): Promise<{
  venueCacheKeys: string[]
  queueCount: number
  taintedUrls: string[]
}> {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys()
    const venueCacheKeys = cacheNames.filter((n) => n.includes('venue-data'))

    const taintedUrls: string[] = []
    for (const name of cacheNames) {
      const cache = await caches.open(name)
      const requests = await cache.keys()
      for (const req of requests) {
        if (req.url.includes('/events') || req.url.includes('token=')) {
          taintedUrls.push(req.url)
        }
      }
    }

    const queueCount = await new Promise<number>((resolve) => {
      const req = indexedDB.open('pwa-sync', 1)
      req.onerror = () => resolve(0)
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('score-queue')) {
          resolve(0)
          return
        }
        const tx = db.transaction('score-queue', 'readonly')
        const countReq = tx.objectStore('score-queue').count()
        countReq.onsuccess = () => resolve(countReq.result)
        countReq.onerror = () => resolve(0)
      }
      req.onupgradeneeded = () => {
        // Fresh DB with no prior queue — treat as empty.
        resolve(0)
      }
    })

    return { venueCacheKeys, queueCount, taintedUrls }
  })
}

test.describe('Feature: PWA Venue Mode (Offline) — hygiene', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  test.beforeEach(async () => {
    if (!(await apiRunning())) test.skip()
  })

  test('Scenario: Sign-out wipes offline data', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)

    // Warm the venue cache and queue a score offline before signing out.
    await page.context().setOffline(true)
    await page.reload()
    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()
    await page.context().setOffline(false)

    const before = await readVenueCacheAndQueueState(page)
    expect(before.venueCacheKeys.length).toBeGreaterThan(0)

    await page.goto('/signout')
    await page.waitForURL('/')

    const after = await readVenueCacheAndQueueState(page)
    expect(after.venueCacheKeys).toEqual([])
    expect(after.queueCount).toBe(0)
  })

  test('Scenario: No token-bearing URL is ever cached', async ({ page }) => {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2)
    await page.addInitScript((token: string) => {
      localStorage.setItem('auth_token', token)
    }, fixture.playerToken)

    // Visit every venue view — Matches opens the live SSE connection
    // (?token=<JWT> in the URL), which must never be written to Cache Storage.
    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    await waitForServiceWorkerReady(page)
    await page.reload()
    await waitForControllingServiceWorker(page)
    await page.waitForTimeout(1500) // let the SSE connection open
    await page.goto(`/tournament/${fixture.tournamentId}/standings`)
    await page.goto(`/tournament/${fixture.tournamentId}/bracket`)

    const { taintedUrls } = await readVenueCacheAndQueueState(page)
    expect(taintedUrls).toEqual([])
  })
})
