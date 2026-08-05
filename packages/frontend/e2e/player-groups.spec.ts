/**
 * G2.5 — Player Groups E2E tests
 *
 * Covers: My Groups tab; Group page (Chat · Members · Invite); unread badge.
 *
 * NOTE: These tests require both the API server (port 3001) and the frontend
 * dev server (port 5173) to be running. If servers are unavailable the test
 * block is skipped via a prerequisite check.
 *
 * Run: npx playwright test player-groups
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import {
  ROUTES,
  API_CONFIG,
  SELECTORS,
} from './config'

// ── Prerequisite check ───────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sign up a new player account and return a player-session token.
 * Uses the /auth/signup + /auth/login flow.
 */
async function signupAndGetToken(user: { email: string; name: string; password: string }) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name })
  if (!res.ok) throw new Error(`player-token failed: ${await res.text()}`)
  const data = await res.json()
  return { token: data.playerToken as string, playerId: data.playerId as string }
}

/**
 * Create a player group via API and return its id.
 */
async function createGroup(token: string, name: string) {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/**
 * Send a message to a group via API.
 */
async function sendGroupMessage(token: string, groupId: string, body: string) {
  const res = await apiCall(`/player/groups/${groupId}/messages`, 'POST', { body }, token)
  if (!res.ok) throw new Error(`Send message failed: ${await res.text()}`)
  return res.json()
}

/**
 * Log in to the frontend app via localStorage token injection.
 */
async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('G2.5 — Player Groups', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('My Groups nav tab is present and navigates to /groups', async ({ page }) => {
    // The Groups nav tab lives in the mobile bottom nav (hidden at ≥640px).
    // Set a mobile viewport so it's visible.
    await page.setViewportSize({ width: 390, height: 844 })

    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    // ISSUE-62: /browse is wrapped in DiscoveryGate, which renders <NotFound />
    // with PUBLIC_DISCOVERY_ENABLED=false — no nav at all, regardless of this
    // test's own concern (whether the nav tab renders and navigates). /play is
    // auth-gated but outside DiscoveryGate, so it renders the shell on any
    // environment.
    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/play')

    // Nav tab should be visible
    const navTab = page.locator('[data-testid="nav-groups"]')
    await expect(navTab).toBeVisible({ timeout: 5000 })

    await navTab.click()
    await expect(page).toHaveURL(/\/groups/, { timeout: 5000 })
  })

  test('Group list shows the player\'s groups', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    // Create a group via API
    const groupName = `My Test Group ${Date.now()}`
    await createGroup(token, groupName)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/groups')

    await expect(page.locator('[data-testid="group-list-item"]').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator(`text=${groupName}`)).toBeVisible()
  })

  test('A player who already owns a group can create a second one (ISSUE-54)', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const firstGroupName = `First Group ${Date.now()}`
    await createGroup(token, firstGroupName)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/groups')

    await expect(page.locator(`text=${firstGroupName}`)).toBeVisible({ timeout: 5000 })

    // The create-group CTA must still be reachable now that the list is non-empty.
    const cta = page.locator('[data-testid="create-group-cta"]')
    await expect(cta).toBeVisible({ timeout: 5000 })
    await cta.click()

    const secondGroupName = `Second Group ${Date.now()}`
    await page.locator('[data-testid="create-group-name-input"]').fill(secondGroupName)
    await page.locator('[data-testid="create-group-submit"]').click()

    await expect(page.locator(`text=${firstGroupName}`)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(`text=${secondGroupName}`)).toBeVisible({ timeout: 5000 })
  })

  test('Tapping a group opens the Group page with Chat and Members tabs', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Chat Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto('http://localhost:5173/groups')

    // Click the first group
    await page.locator('[data-testid="group-list-item"]').first().click()

    // Should navigate to /groups/<id>
    // eslint-disable-next-line security/detect-non-literal-regexp -- groupId comes from the test fixture's own setup, not user input
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}`), { timeout: 5000 })

    // Chat panel visible
    await expect(page.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })
  })

  test('Group chat renders messages with Name · time', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Msg Group ${Date.now()}`)
    await sendGroupMessage(token, groupId, 'Hello group!')

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await expect(page.locator('[data-testid="group-message-item"]').first()).toBeVisible({ timeout: 5000 })
    // Message body should appear
    await expect(page.locator('text=Hello group!')).toBeVisible()
  })

  test('Members panel lists group members', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Members Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Switch to Members tab
    const membersTab = page.locator('[data-testid="group-tab-members"]')
    await expect(membersTab).toBeVisible({ timeout: 5000 })
    await membersTab.click()

    await expect(page.locator('[data-testid="members-panel"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="member-item"]').first()).toBeVisible()
  })

  test('Invite form is visible on Members panel', async ({ page }) => {
    const user = createTestUser()
    const { token } = await signupAndGetToken(user)

    const groupId = await createGroup(token, `Invite Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    // Switch to Members tab
    const membersTab = page.locator('[data-testid="group-tab-members"]')
    await expect(membersTab).toBeVisible({ timeout: 5000 })
    await membersTab.click()

    await expect(page.locator('[data-testid="invite-email-input"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="invite-send-button"]')).toBeVisible()
  })

  test('Sent message appears live via SSE without page refresh', async ({ page }) => {
    // G2.5: "Sent message appears live (SSE)"
    // Player A watches the chat; player B sends a message via API; the message must
    // appear in player A's view without any navigation.
    const userA = createTestUser()
    const userB = createTestUser()
    const { token: tokenA } = await signupAndGetToken(userA)
    // Pre-create player B so they exist for invite-accept (existing players skip age gate)
    await signupAndGetToken(userB)

    const groupId = await createGroup(tokenA, `SSE Group ${Date.now()}`)

    // Invite and add player B to the group so they can send messages
    const invRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: userB.email }, tokenA)
    const { rawToken: invToken } = await invRes.json()
    const acceptRes = await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
      token: invToken, email: userB.email,
    })
    const { token: tokenB } = await acceptRes.json()

    // Pre-load a message so the chat panel is ready
    await sendGroupMessage(tokenA, groupId, 'Hello world')

    await loginFrontend(page, tokenA)
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    // Wait for the chat panel to be open and initial message to render
    await expect(page.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="group-message-item"]').first()).toBeVisible()

    // Player B sends a message via API while player A has the page open
    const liveMsg = `live-${Date.now()}`
    await sendGroupMessage(tokenB, groupId, liveMsg)

    // The new message must appear without a page refresh (SSE message.created event)
    await expect(
      page.locator(`[data-testid="group-message-item"]:has-text("${liveMsg}")`)
    ).toBeVisible({ timeout: 8000 })
  })

  test('System event "Sam joined" appears inline in chat', async ({ page }) => {
    // G2.5: "System events ('Sam joined') appear inline"
    const owner = createTestUser()
    const joiner = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    // Pre-create the joiner so they have an age record for the invite accept
    await signupAndGetToken(joiner)

    const groupId = await createGroup(ownerToken, `SysEvent Group ${Date.now()}`)

    // Owner invites the joiner; joiner accepts via API — this triggers a "joined" system event
    const invRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: joiner.email }, ownerToken)
    const { rawToken } = await invRes.json()
    await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
      token: rawToken, email: joiner.email,
    })

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await expect(page.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })

    // A system event row should appear for the join event
    await expect(
      page.locator('[data-testid="group-system-event"]')
    ).toBeVisible({ timeout: 5000 })
  })

  test('Unread badge appears on My Groups nav tab when there are unseen messages', async ({ page }) => {
    // G2.5: "Unread badge on My Groups nav tab"
    // ISSUE-56: unread is now server-side (player_group_members.last_read_at)
    // and excludes the viewer's OWN messages, so this needs a genuine second
    // member — sending from the viewer's own token would never count as
    // unread under the new semantics.
    // ISSUE-62: usePersonalEventsStream's app-wide SSE connection to
    // /player/notifications/events pushes a group.unread.changed event live —
    // no refocus needed. useGroupsWithUnread's own mount/focus poll remains
    // a fallback, not the only update path.
    // The badge lives in the mobile bottom nav (hidden at >=640px) — set a
    // mobile viewport, matching this file's other nav-tab tests.
    await page.setViewportSize({ width: 390, height: 844 })

    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    // Pre-create the member so they exist for invite-accept (existing players skip age gate)
    await signupAndGetToken(member)

    const groupId = await createGroup(ownerToken, `Badge Group ${Date.now()}`)
    const invRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: member.email }, ownerToken)
    const { rawToken: invToken } = await invRes.json()
    const acceptRes = await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
      token: invToken, email: member.email,
    })
    const { token: memberToken } = await acceptRes.json()

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await expect(page.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })

    // Navigate away so the group is "unread"
    await page.goto('http://localhost:5173/matches')

    // The other member sends a message while the owner is elsewhere
    await sendGroupMessage(memberToken, groupId, `unread-${Date.now()}`)

    const badge = page.locator('[data-testid="groups-unread-badge"]')
    await expect(badge).toBeVisible({ timeout: 5000 })

    // The list row also shows its own unread count
    await page.goto('http://localhost:5173/groups')
    await expect(page.locator('[data-testid="group-unread-badge"]')).toHaveText('1')

    // Opening the group resets the unread count everywhere
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await expect(page.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })
    await expect(badge).not.toBeVisible()

    await page.goto('http://localhost:5173/groups')
    await expect(page.locator('[data-testid="group-unread-badge"]')).not.toBeVisible()
  })

  test('Sitting on My Groups, the row badge appears live from an SSE push — no reload (ISSUE-73)', async ({ page, browser }) => {
    // ISSUE-73: useGroupList used to fetch /player/groups once on mount and
    // never look at groupUnreadStore again, so a group.unread.changed push —
    // which the store already reflected correctly (proven by the nav badge
    // test above) — never reached this per-row badge without a reload. This
    // test never navigates page A after the initial load, which is exactly
    // what the previous "list row also shows its own unread count" assertion
    // (above) didn't prove: that test re-navigates to /groups, which forces
    // a fresh mount fetch and would pass even on the old, broken code.
    //
    // Two real browser contexts (not one page + a raw API send) so the
    // sender genuinely goes through the send button/SSE pipeline while the
    // receiver's page stays parked on the list the whole time.
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    // Pre-create the member so they exist for invite-accept (existing players skip age gate)
    await signupAndGetToken(member)

    const groupId = await createGroup(ownerToken, `Live Row Badge Group ${Date.now()}`)
    const invRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: member.email }, ownerToken)
    const { rawToken: invToken } = await invRes.json()
    const acceptRes = await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
      token: invToken, email: member.email,
    })
    const { token: memberToken } = await acceptRes.json()

    // Owner (A) lands on My Groups and stays there — no further navigation.
    await loginFrontend(page, ownerToken)
    await page.goto('http://localhost:5173/groups')
    await expect(page.locator('[data-testid="group-list-item"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="group-unread-badge"]')).not.toBeVisible()

    // Member (B), in a separate browser context, opens the group and sends
    // through the real chat UI.
    const memberContext = await browser.newContext()
    try {
      const memberPage = await memberContext.newPage()
      await loginFrontend(memberPage, memberToken)
      await memberPage.goto(`http://localhost:5173/groups/${groupId}`)
      await expect(memberPage.locator('[data-testid="group-chat-panel"]')).toBeVisible({ timeout: 5000 })

      const liveMsg = `live-badge-${Date.now()}`
      await memberPage.fill('[data-testid="group-message-input"]', liveMsg)
      await memberPage.click('[data-testid="group-message-send-button"]')
      await expect(
        memberPage.locator(`[data-testid="group-message-item"]:has-text("${liveMsg}")`)
      ).toBeVisible({ timeout: 5000 })
    } finally {
      await memberContext.close()
    }

    // A's row badge must appear without any navigation/reload of A's page.
    await expect(page.locator('[data-testid="group-unread-badge"]')).toHaveText('1', { timeout: 8000 })
  })
})
