/**
 * Notifications Center — E2E tests (P2.3/P2.4)
 *
 * Covers e2e-scenarios.md "Feature: Notifications Center" (added 2026-07-19,
 * coverage-gap audit): unread badge live update, list + mark-read
 * (newest-first), deep-link to source, empty state, notify-level mute.
 *
 * The only verified trigger into a player's personal-notification feed is an
 * @mention in a group text message (or a membership-change event — kick/
 * promote/demote/auto-transfer). Regular non-mention group messages do not
 * post here — matching "targeting them" in the scenario docs.
 *
 * Run: npx playwright test notifications
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

async function serversRunning(): Promise<boolean> {
  try {
    const [api, fe] = await Promise.all([
      fetch(`${API_CONFIG.BASE_URL}/health`).then(r => r.ok),
      fetch('http://localhost:5173').then(r => r.ok),
    ])
    return api && fe
  } catch {
    return false
  }
}

/**
 * createTestUser() always returns the same fixed name ("Test User"), which is
 * fine for single-player tests but ambiguous for @mention resolution once a
 * group has 2+ members sharing that name (name -> playerId is a map, last one
 * wins). Mentioned players in these tests need a distinguishable, single-word
 * name (the backend's bare @word mention pattern is /@([A-Za-z0-9_-]+)/).
 */
function createMentionableUser(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { email: `${label}-${suffix}@example.com`, name: `${label}-${suffix}` }
}

// disableQuietHours: this file's whole point is asserting a personal
// notification was (or wasn't) created, and DEFAULT_PLAYER_SETTINGS' quiet
// hours (8am-5pm) silently drop @mention notifications for any player who
// never set a preference — which a freshly-seeded test player never does.
// Without this, every test here is time-of-day-dependent (discovered via
// direct reporter output: zero "mentioned you" notifications were ever
// created, confirmed by hand against the live API and DB — not assumed).
async function signupAndGetToken(user: { email: string; name: string }) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name, disableQuietHours: true })
  if (!res.ok) throw new Error(`player-token failed: ${await res.text()}`)
  const data = await res.json()
  return { token: data.playerToken as string, playerId: data.playerId as string }
}

async function createGroup(token: string, name: string) {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Invites `invitee` into `groupId` (owner's token) and accepts — returns the invitee's player token. */
async function inviteAndAccept(ownerToken: string, groupId: string, invitee: { email: string; name: string }) {
  const invRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: invitee.email }, ownerToken)
  if (!invRes.ok) throw new Error(`Invite failed: ${await invRes.text()}`)
  const { rawToken } = await invRes.json()
  const acceptRes = await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
    token: rawToken,
    email: invitee.email,
  })
  if (!acceptRes.ok) throw new Error(`Accept failed: ${await acceptRes.text()}`)
  const data = await acceptRes.json()
  return data.token as string
}

async function sendGroupMessage(token: string, groupId: string, body: string) {
  const res = await apiCall(`/player/groups/${groupId}/messages`, 'POST', { body }, token)
  if (!res.ok) throw new Error(`Send message failed: ${await res.text()}`)
  return res.json()
}

async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

test.describe('Feature: Notifications Center', () => {
  test.beforeEach(async ({ page }) => {
    if (!(await serversRunning())) {
      test.skip()
    }
    // The badge lives in the mobile bottom nav (hidden at wider viewports).
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test('Scenario: Unread badge reflects a new notification', async ({ page }) => {
    const owner = createTestUser()
    const mentioned = createMentionableUser('BadgeMentioned')
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: mentionedToken } = await signupAndGetToken(mentioned)

    const groupId = await createGroup(ownerToken, `Notif Badge Group ${Date.now()}`)
    await inviteAndAccept(ownerToken, groupId, mentioned)

    // ISSUE-62 (reopened): /browse is wrapped in DiscoveryGate, which renders
    // <NotFound /> with PUBLIC_DISCOVERY_ENABLED=false — no nav (so the badge
    // element can't exist) and no ResponsiveLayout (so usePersonalEventsStream
    // never mounts, so no SSE connection is ever opened). The first assertion
    // used to pass vacuously regardless of environment. /play is auth-gated
    // but outside DiscoveryGate (App.tsx), so it renders the shell on any
    // environment and actually exercises the live push.
    await loginFrontend(page, mentionedToken)
    await page.goto('http://localhost:5173/play')
    // ISSUE-65: inviteAndAccept (above) already posted a personal notification
    // (ISSUE-55), so the badge starts at 1, not 0.
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveText('1')

    // Another member posts a message targeting them (an @mention) while they
    // are on a different page — no refocus, no reload. ISSUE-62:
    // usePersonalEventsStream's app-wide SSE connection to
    // /player/notifications/events pushes this live.
    await sendGroupMessage(ownerToken, groupId, `Hey @${mentioned.name} check this out`)

    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveText('2')
  })

  test('Scenario: Opening the notifications page lists newest-first and marks read', async ({ page }) => {
    const owner = createTestUser()
    const member = createMentionableUser('ListMember')
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken } = await signupAndGetToken(member)

    const groupId = await createGroup(ownerToken, `Notif List Group ${Date.now()}`)
    await inviteAndAccept(ownerToken, groupId, member)

    // First notification: an @mention.
    await sendGroupMessage(ownerToken, groupId, `Hey @${member.name}, first`)
    await new Promise(r => setTimeout(r, 50))

    // Second, later notification: a promotion (distinct body text so ordering is verifiable).
    const sessionRes = await apiCall('/player/session', 'GET', undefined, memberToken)
    const { playerId: memberPlayerId } = await sessionRes.json()
    const promoteRes = await apiCall(
      `/player/groups/${groupId}/members/${memberPlayerId}/promote`,
      'POST',
      {},
      ownerToken
    )
    expect(promoteRes.ok).toBe(true)

    await loginFrontend(page, memberToken)
    await page.goto('http://localhost:5173/notifications')
    await expect(page.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()

    // ISSUE-65: inviteAndAccept (above) now also posts a personal notification
    // (ISSUE-55) — a 3rd card the arithmetic here predates. Scope to the two
    // notifications this test actually seeds, by body text, instead of
    // counting every card on the page.
    const cards = page.locator(SELECTORS.NOTIFICATION_CARD)
    const promotionCard = cards.filter({ hasText: 'promoted to owner' })
    const mentionCard = cards.filter({ hasText: 'mentioned you' })
    await expect(promotionCard).toBeVisible({ timeout: 8000 })
    await expect(mentionCard).toBeVisible({ timeout: 8000 })

    // Newest-first: the promotion (posted second, after the mention) must
    // render above it. The invite card is also present but isn't part of
    // this ordering claim.
    const cardTexts = await cards.allTextContents()
    const promotionIndex = cardTexts.findIndex(t => t.includes('promoted to owner'))
    const mentionIndex = cardTexts.findIndex(t => t.includes('mentioned you'))
    expect(promotionIndex).toBeLessThan(mentionIndex)

    // Badge clears once the page has marked everything read. ISSUE-62: /play
    // instead of /browse — /browse's DiscoveryGate would make this pass
    // vacuously (no nav at all) rather than genuinely proving the badge is 0.
    await page.goto('http://localhost:5173/play')
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveCount(0)
  })

  test('Scenario: Tapping a notification deep-links to its source group', async ({ page }) => {
    const owner = createTestUser()
    const mentioned = createMentionableUser('DeeplinkMentioned')
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: mentionedToken } = await signupAndGetToken(mentioned)

    const groupId = await createGroup(ownerToken, `Notif Deeplink Group ${Date.now()}`)
    await inviteAndAccept(ownerToken, groupId, mentioned)
    await sendGroupMessage(ownerToken, groupId, `Hey @${mentioned.name} check this out`)

    await loginFrontend(page, mentionedToken)
    await page.goto('http://localhost:5173/notifications')

    // ISSUE-65: inviteAndAccept (above) also posts an invite notification
    // (ISSUE-55), which renders as a non-navigating Accept card, not a link —
    // .first() is no longer reliably the @mention card. Scope to it by body
    // text instead of position.
    const card = page.locator(SELECTORS.NOTIFICATION_CARD).filter({ hasText: 'mentioned you' })
    await expect(card).toBeVisible({ timeout: 8000 })
    await card.click()

    // eslint-disable-next-line security/detect-non-literal-regexp -- groupId comes from this test's own fixture setup, not user input
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}`))
  })

  test('Scenario: Empty state for a brand-new player', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/notifications')

    await expect(page.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()
    await expect(page.locator(SELECTORS.EMPTY_STATE)).toBeVisible()
    await expect(page.locator(SELECTORS.ERROR_STATE)).toHaveCount(0)
    await expect(page.locator(SELECTORS.LOADING_STATE)).toHaveCount(0)
  })

  test('Scenario: Notify-level mute is honored', async ({ page }) => {
    const owner = createTestUser()
    const muted = createMentionableUser('MutedPlayer')
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: mutedToken, playerId: mutedPlayerId } = await signupAndGetToken(muted)

    const groupId = await createGroup(ownerToken, `Notif Mute Group ${Date.now()}`)
    await inviteAndAccept(ownerToken, groupId, muted)

    // The muted player mutes this group via the existing NotifyLevelControl endpoint.
    const muteRes = await apiCall(
      `/player/groups/${groupId}/members/${mutedPlayerId}/notify-level`,
      'PATCH',
      { notifyLevel: 'muted' },
      mutedToken
    )
    expect(muteRes.ok).toBe(true)

    // Owner @mentions the now-muted player — muting suppresses this specific
    // group-message notification. ISSUE-55's own invite notification (from
    // inviteAndAccept, above) legitimately remains: this scenario is about
    // the group-message mute, not an empty inbox (ISSUE-65).
    await sendGroupMessage(ownerToken, groupId, `Hey @${muted.name}, are you there?`)

    await loginFrontend(page, mutedToken)
    await page.goto('http://localhost:5173/notifications')
    await expect(page.locator(SELECTORS.NOTIFICATIONS_PAGE)).toBeVisible()
    // Sanity: the page genuinely loaded (the invite card) — not an empty or
    // broken page, which would also satisfy the absence check below.
    await expect(page.locator(SELECTORS.NOTIFICATION_CARD).filter({ hasText: 'invited' })).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.NOTIFICATION_CARD).filter({ hasText: 'mentioned you' })).toHaveCount(0)
  })
})
