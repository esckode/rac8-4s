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
 * merged into Play); ISSUE-29 then dropped Browse; ISSUE-59 fixed the bar
 * at five permanently (Groups/Play/Ratings/Alerts/More) by adding Ratings
 * and moving Browse into the More sheet instead of a 6th slot.
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
      await page.goto('/play')

      const items = page.locator('.responsive-bottom-nav-item')
      await expect(items.first()).toBeVisible({ timeout: 10000 })
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

/**
 * ISSUE-23 — auth pages hardcoded a 390x844 design-mockup frame (inline
 * `width: 390, height: 844`) instead of joining the responsive system,
 * causing clipped content below 390px and a fixed phone-shaped column
 * with white gutters above it. `.auth-shell` (responsive.css) replaces
 * it: fluid below the 640px breakpoint the nav already switches at,
 * capped at 448px (the existing .max-w-md constant) and centred above.
 *
 * Login/Signup/ForgotPassword/ResetPassword all render the shell via
 * `data-testid="auth-shell"` — assert on that, not the class name.
 */
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password']

test.describe('Auth page shell geometry (ISSUE-23)', () => {
  for (const route of AUTH_ROUTES) {
    test(`${route} shell is fluid below 640px and capped above it`, async ({ page }) => {
      await page.goto(route)
      const shell = page.getByTestId('auth-shell')
      await expect(shell).toBeVisible({ timeout: 10000 })

      await page.setViewportSize({ width: 360, height: 740 })
      let box = await shell.boundingBox()
      expect(box).not.toBeNull()
      expect(Math.round(box!.width)).toBe(360)
      expect(Math.round(box!.x)).toBe(0)

      await page.setViewportSize({ width: 440, height: 880 })
      box = await shell.boundingBox()
      expect(box).not.toBeNull()
      expect(Math.round(box!.width)).toBe(440)
      expect(Math.round(box!.x)).toBe(0)

      await page.setViewportSize({ width: 1024, height: 900 })
      box = await shell.boundingBox()
      expect(box).not.toBeNull()
      expect(Math.round(box!.width)).toBe(448)
      // Centred: equal gutters on both sides.
      const rightGutter = 1024 - (box!.x + box!.width)
      expect(Math.abs(box!.x - rightGutter)).toBeLessThanOrEqual(1)
    })
  }

  test('Login: no content clips at any width — the footer link stays inside the viewport', async ({ page }) => {
    for (const width of [360, 440, 640, 1024]) {
      await page.setViewportSize({ width, height: 760 })
      await page.goto('/login')
      const footerLink = page.getByRole('button', { name: /create an account/i })
      await expect(footerLink).toBeVisible({ timeout: 10000 })
      const box = await footerLink.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }
  })
})
