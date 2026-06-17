import { test, expect } from '@playwright/test'
import {
  apiCall,
  getOrganizerToken,
  createDoublesTournamentWithSoloRegistrants,
} from './fixtures'
import { SELECTORS } from './config'

/**
 * E2E: Partner Requests & Confirmation (Doubles) — frontend Slice 2.
 *
 * Covers the e2e-scenarios.md "Partner Requests & Confirmation (Doubles)" feature:
 *   - "Solo registrant views available partners"
 *   - "Solo registrant sends a partnership request" + "Partner confirms → team formed"
 *   - confirm error path (only the partner can confirm)
 *
 * Players authenticate with magic-link player-session tokens (the guest flow),
 * injected into localStorage before the protected route loads.
 */
test.describe('Partner Confirmation - request flow', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  function authAs(token: string) {
    return async ({ page }: { page: any }) => {
      await page.addInitScript((t: string) => {
        localStorage.setItem('auth_token', t)
      }, token)
    }
  }

  test('solo registrant views available partners, excluding themselves', async ({ page }) => {
    const { tournamentId, players } = await createDoublesTournamentWithSoloRegistrants(
      organizerToken,
      2
    )
    const [a, b] = players

    await authAs(a.token)({ page })
    await page.goto(`/tournament/${tournamentId}/details`)

    const finder = page.locator(SELECTORS.PARTNER_FINDER)
    await expect(finder).toBeVisible()
    await expect(finder.locator(SELECTORS.PARTNER_ROW)).toHaveCount(1)
    await expect(finder.getByText(b.name)).toBeVisible()
    await expect(finder.getByText(a.name)).toHaveCount(0)
  })

  test('request + confirm forms a team', async ({ page, context }) => {
    const { tournamentId, players } = await createDoublesTournamentWithSoloRegistrants(
      organizerToken,
      2
    )
    const [a, b] = players

    // A sends a partnership request to B via the finder
    await authAs(a.token)({ page })
    await page.goto(`/tournament/${tournamentId}/details`)
    await page.locator(SELECTORS.REQUEST_PARTNER_BUTTON).first().click()
    await expect(page.getByText(/pending/i)).toBeVisible()

    // Look up the pending registrationId B must confirm
    const incoming = await apiCall(
      `/tournaments/${tournamentId}/partner-requests`,
      'GET',
      undefined,
      b.token
    )
    expect(incoming.ok).toBeTruthy()
    const { requests } = await incoming.json()
    const fromA = requests.find((r: any) => r.requesterId === a.playerId)
    expect(fromA).toBeTruthy()

    // B confirms in a second browser context
    const bPage = await context.newPage()
    await bPage.addInitScript((t: string) => {
      localStorage.setItem('auth_token', t)
    }, b.token)
    await bPage.goto(`/registrations/${fromA.registrationId}/confirm`)
    await bPage.locator(SELECTORS.CONFIRM_PARTNERSHIP_BUTTON).click()
    await expect(bPage.locator(SELECTORS.CONFIRM_SUCCESS)).toBeVisible()

    // Team is formed: A's finder no longer lists any available partner
    await page.reload()
    await expect(page.locator(SELECTORS.PARTNER_FINDER)).toBeVisible()
    await expect(page.locator(SELECTORS.PARTNER_ROW)).toHaveCount(0)
  })

  test('confirm shows an error when the caller is not the partner (403)', async ({ page }) => {
    const { tournamentId, players } = await createDoublesTournamentWithSoloRegistrants(
      organizerToken,
      2
    )
    const [a, b] = players

    // A requests B
    const req = await apiCall(
      `/tournaments/${tournamentId}/partner-requests`,
      'POST',
      { targetPlayerId: b.playerId },
      a.token
    )
    expect(req.ok).toBeTruthy()
    const { registrationId } = await req.json()

    // The requester A (not the partner B) tries to confirm → 403
    await authAs(a.token)({ page })
    await page.goto(`/registrations/${registrationId}/confirm`)
    await page.locator(SELECTORS.CONFIRM_PARTNERSHIP_BUTTON).click()
    await expect(page.locator(SELECTORS.CONFIRM_ERROR)).toBeVisible()
  })
})
