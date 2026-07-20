import { test, expect } from '@playwright/test'
import { SELECTORS } from './config'
import { clearAuthState, createTestUser, signupViaApi } from './fixtures'

test.describe('Feature: Offline Support & Error Handling', () => {
  test.describe('Scenario: Rate limit error shows countdown', () => {
    test('login is rate limited after 5 failed attempts and shows a ticking countdown', async ({ page }) => {
      const user = createTestUser()

      // Given: I have an account
      const signupResponse = await signupViaApi(user)
      expect(signupResponse.ok).toBeTruthy()

      await page.goto('/login')
      await clearAuthState(page)
      await page.goto('/login')

      // And: I have attempted login 5 times unsuccessfully
      for (let i = 0; i < 5; i++) {
        await page.fill('input[type="email"]', user.email)
        await page.fill('input[type="password"]', 'WrongPassword123')
        await page.click('button:has-text("Sign In")')
        await page.waitForTimeout(500)
      }

      // When: I attempt login a 6th time
      await page.fill('input[type="email"]', user.email)
      await page.fill('input[type="password"]', 'WrongPassword123')
      await page.click('button:has-text("Sign In")')

      // Then: I should see error "Too many attempts"
      const rateLimitError = page.locator(SELECTORS.LOGIN_RATE_LIMIT_ERROR)
      await expect(rateLimitError).toBeVisible()
      await expect(rateLimitError).toContainText(/too many attempts/i)

      // And: a visible, ticking retry countdown seeded from retryAfterSeconds (15 min)
      const countdown = page.locator(SELECTORS.LOGIN_RETRY_COUNTDOWN)
      await expect(countdown).toBeVisible()
      await expect(countdown).toContainText('15:00')

      // And: form fields should be disabled
      await expect(page.locator('input[type="email"]')).toBeDisabled()
      await expect(page.locator('input[type="password"]')).toBeDisabled()
      await expect(page.locator('button:has-text("Sign In")')).toBeDisabled()

      // And: the countdown ticks down client-side
      await page.waitForTimeout(1200)
      await expect(countdown).toContainText('14:59')
    })
  })
})
