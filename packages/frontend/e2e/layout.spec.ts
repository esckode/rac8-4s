import { test, expect } from '@playwright/test'
import { apiCall, createTestUser, defaultAgeAttestation } from './fixtures'

/**
 * ISSUE-26 — bottom nav label geometry guard. The bug shipped because
 * jsdom (jest) reports zero-size boxes for real layout and evaluates no
 * media queries, so this has to be Playwright. Assert on boundingBox(),
 * never on text presence — the clipped label was always present in the
 * DOM, just positioned off-screen (x < 0) or overflowing its cell; that
 * distinction is the whole reason ISSUE-26 shipped undetected.
 *
 * ISSUE-28 collapsed the bar from six items to five (Standings + Matches
 * merged into Play); ISSUE-29 will drop Browse next, landing on four.
 * This guard passes at whatever item count is live — it measures
 * geometry, not a fixed count.
 */

const WIDTHS = [360, 400, 430]

async function loginAsFreshPlayer(page: import('@playwright/test').Page): Promise<void> {
  const user = createTestUser()
  const res = await apiCall('/api/auth/signup', 'POST', {
    ...user,
    dob_attestation: defaultAgeAttestation(),
  })
  if (!res.ok) throw new Error(`Signup failed: ${res.status} ${await res.text()}`)
  const { token } = await res.json()

  await page.addInitScript(t => {
    localStorage.setItem('auth_token', t as string)
  }, token)
}

test.describe('Bottom nav label geometry (ISSUE-26)', () => {
  for (const width of WIDTHS) {
    test(`every nav label sits fully inside its item and the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await loginAsFreshPlayer(page)
      await page.goto('/play', { waitUntil: 'networkidle' })

      const items = page.locator('.responsive-bottom-nav-item')
      const count = await items.count()
      expect(count).toBeGreaterThan(0)

      for (let i = 0; i < count; i++) {
        const item = items.nth(i)
        const itemBox = await item.boundingBox()
        expect(itemBox).not.toBeNull()

        // The label is the last <span> in the item (icon span is first).
        const label = item.locator('span').last()
        const labelBox = await label.boundingBox()
        expect(labelBox).not.toBeNull()
        if (!itemBox || !labelBox) continue

        // Never off-screen to the left, and never wider than its own cell.
        expect(labelBox.x).toBeGreaterThanOrEqual(0)
        expect(labelBox.x).toBeGreaterThanOrEqual(itemBox.x)
        expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(itemBox.x + itemBox.width + 0.5)
        // And inside the viewport entirely.
        expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(width)
      }
    })
  }
})
