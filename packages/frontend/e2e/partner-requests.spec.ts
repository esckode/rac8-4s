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

  test('confirming a partner posts a notification to both players naming the other (ISSUE-19)', async ({
    page,
    context,
  }) => {
    const { tournamentId, players } = await createDoublesTournamentWithSoloRegistrants(
      organizerToken,
      2
    )
    const [a, b] = players

    await authAs(a.token)({ page })
    await page.goto(`/tournament/${tournamentId}/details`)
    await page.locator(SELECTORS.REQUEST_PARTNER_BUTTON).first().click()
    await expect(page.getByText(/pending/i)).toBeVisible()

    const incoming = await apiCall(
      `/tournaments/${tournamentId}/partner-requests`,
      'GET',
      undefined,
      b.token
    )
    const { requests } = await incoming.json()
    const fromA = requests.find((r: any) => r.requesterId === a.playerId)

    const bPage = await context.newPage()
    await bPage.addInitScript((t: string) => {
      localStorage.setItem('auth_token', t)
    }, b.token)
    await bPage.goto(`/registrations/${fromA.registrationId}/confirm`)
    await bPage.locator(SELECTORS.CONFIRM_PARTNERSHIP_BUTTON).click()
    await expect(bPage.locator(SELECTORS.CONFIRM_SUCCESS)).toBeVisible()

    // A is notified naming B, and B is notified naming A.
    await page.goto(`/notifications`)
    await expect(page.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()
    await expect(page.locator(SELECTORS.NOTIFICATION_CARD).filter({ hasText: b.name })).toBeVisible({
      timeout: 8000,
    })

    await bPage.goto(`/notifications`)
    await expect(bPage.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()
    await expect(
      bPage.locator(SELECTORS.NOTIFICATION_CARD).filter({ hasText: a.name })
    ).toBeVisible({ timeout: 8000 })
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

/**
 * ISSUE-19 — auto-pair notifications go through the `teams.formed` job queue,
 * enqueued after group creation commits (see UAT_ISSUES.md). Unlike the
 * confirm-time notifications above (posted inline from the route), this path
 * requires the background worker (`npm run dev:worker --workspace=packages/api`)
 * to consume the job — same prerequisite as the assistant/coach specs
 * (CLAUDE.md §8). If the worker isn't running, this test fails on the
 * notification-card wait rather than hanging indefinitely.
 */
test.describe('Partner Confirmation - auto-pair notifications', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  test('auto-pairing at group creation notifies both paired players (ISSUE-19)', async ({
    page,
    context,
  }) => {
    const { tournamentId, players } = await createDoublesTournamentWithSoloRegistrants(
      organizerToken,
      4
    )
    const [a, b] = players

    const closeRes = await apiCall(
      `/tournaments/${tournamentId}/advance`,
      'POST',
      { action: 'CLOSE_REGISTRATION' },
      organizerToken
    )
    expect(closeRes.ok).toBeTruthy()

    const groupsRes = await apiCall(
      `/tournaments/${tournamentId}/groups`,
      'POST',
      { numGroups: 1, advancingPerGroup: 1 },
      organizerToken
    )
    expect(groupsRes.ok).toBeTruthy()

    await page.addInitScript((t: string) => {
      localStorage.setItem('auth_token', t)
    }, a.token)
    await page.goto('/notifications')
    await expect(page.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()
    await expect(page.locator(SELECTORS.NOTIFICATION_CARD).first()).toBeVisible({ timeout: 10000 })

    const bPage = await context.newPage()
    await bPage.addInitScript((t: string) => {
      localStorage.setItem('auth_token', t)
    }, b.token)
    await bPage.goto('/notifications')
    await expect(bPage.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()
    await expect(bPage.locator(SELECTORS.NOTIFICATION_CARD).first()).toBeVisible({ timeout: 10000 })
  })
})
