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

async function signupAndGetToken(user: { email: string; name: string }) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name })
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

    await loginFrontend(page, mentionedToken)
    await page.goto('http://localhost:5173/browse')
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveCount(0)
    // useNotificationUnread's SSE connection (ReconnectingEventSource) needs a
    // moment to actually open — sending the mention before it's connected
    // means the message.created event has no listener to reach.
    await page.waitForTimeout(1000)

    // Another member posts a message targeting them (an @mention) while they
    // are on a different page — the badge must update without a reload.
    await sendGroupMessage(ownerToken, groupId, `Hey @${mentioned.name} check this out`)

    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveText('1')
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

    const cards = page.locator(SELECTORS.NOTIFICATION_CARD)
    await expect(cards).toHaveCount(2, { timeout: 8000 })
    // Newest-first: the promotion (posted second) must render before the mention.
    await expect(cards.first()).toContainText('promoted to owner')
    await expect(cards.last()).toContainText('mentioned you')

    // Badge clears once the page has marked everything read.
    await page.goto('http://localhost:5173/browse')
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

    const card = page.locator(SELECTORS.NOTIFICATION_CARD).first()
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

    await loginFrontend(page, mutedToken)
    await page.goto('http://localhost:5173/browse')
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveCount(0)

    // Owner @mentions the now-muted player.
    await sendGroupMessage(ownerToken, groupId, `Hey @${muted.name}, are you there?`)

    // Give the (fire-and-forget) notification pipeline a moment, then confirm
    // no notification landed — badge stays absent.
    await page.waitForTimeout(1500)
    await expect(page.locator(SELECTORS.NOTIFICATION_UNREAD_BADGE)).toHaveCount(0)

    await page.goto('http://localhost:5173/notifications')
    await expect(page.locator(SELECTORS.EMPTY_STATE)).toBeVisible()
  })
})
