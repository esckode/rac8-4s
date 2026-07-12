/**
 * LLM Assistant (@coach) — Phase B E2E tests (confirmed write actions)
 *
 * Backend must run ASSISTANT_ADAPTER=mock (default) + JOB_QUEUE=memory
 * (default) — see e2e-scenarios.md "LLM Assistant (@coach) — Phase B
 * confirmed write actions", which these specs implement.
 *
 * MockAssistantClient's deterministic keyword router (B7) fakes only the
 * NL→intent hop: "beat <name> <score>" calls the REAL propose_score tool;
 * "launch ... session" calls the REAL propose_casual_launch tool. Every
 * write still goes through the existing, unmodified route/service at
 * confirm time (design §11 B-Q3: mutate-first, then flip) — these specs
 * exercise the genuine trigger → tool → card → confirm → route-
 * revalidation path end to end, with no model involved.
 *
 * Run: npx playwright test assistant-actions
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG, SELECTORS } from './config'

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

// ── Helpers (mirrors assistant.spec.ts) ─────────────────────────────────────

async function signupAndGetToken(user: { email: string; name: string; password: string }) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name })
  if (!res.ok) throw new Error(`player-token failed: ${await res.text()}`)
  const data = await res.json()
  return { token: data.playerToken as string, playerId: data.playerId as string }
}

async function createGroup(token: string, name: string): Promise<string> {
  const res = await apiCall('/player/groups', 'POST', { name }, token)
  if (!res.ok) throw new Error(`Create group failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

async function createGroupWithMember(
  ownerToken: string,
  groupName: string,
  member: { email: string; name: string }
): Promise<{ groupId: string; memberPlayerId: string }> {
  const groupId = await createGroup(ownerToken, groupName)

  const invRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: member.email }, ownerToken)
  if (!invRes.ok) throw new Error(`Invite failed: ${await invRes.text()}`)
  const { rawToken } = await invRes.json()
  if (!rawToken) throw new Error('Invite response did not include rawToken (production mode?)')

  const dob = new Date()
  dob.setFullYear(dob.getFullYear() - 25)
  const acceptRes = await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
    token: rawToken,
    email: member.email,
    name: member.name,
    ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
  })
  if (!acceptRes.ok) throw new Error(`Invite accept failed: ${await acceptRes.text()}`)
  const acceptBody = await acceptRes.json()
  return { groupId, memberPlayerId: acceptBody.playerId as string }
}

async function seedCasualSession(groupId: string, playerIds: string[]): Promise<string> {
  const res = await apiCall('/test/casual-session', 'POST', { groupId, playerIds })
  if (!res.ok) throw new Error(`casual-session seed failed: ${await res.text()}`)
  const data = await res.json()
  return data.tournamentId as string
}

async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

async function sendCoachMessage(page: any, text: string) {
  await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill(text)
  await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()
}

/** Wait for the first ActionCard to appear in the feed (SSE-delivered, async). */
async function waitForActionCard(page: any, timeout = 8000) {
  await expect(page.locator(SELECTORS.ACTION_CARD).last()).toBeVisible({ timeout })
}

test.describe('LLM Assistant (@coach) — Phase B confirmed write actions', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('score via Coach: card appears, proposer confirms, card renders confirmed', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Coach Score Group ${Date.now()}`)
    await seedCasualSession(groupId, [ownerPlayerId, opponentPlayerId])

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await sendCoachMessage(page, `@coach beat ${opponent.name} 6-4, 6-3`)
    await waitForActionCard(page)

    const card = page.locator(SELECTORS.ACTION_CARD).last()
    await expect(card).toContainText(opponent.name)
    await expect(card.locator(SELECTORS.ACTION_CARD_CONFIRM_BUTTON)).toBeVisible()

    await card.locator(SELECTORS.ACTION_CARD_CONFIRM_BUTTON).click()
    await expect(card.locator(SELECTORS.ACTION_CARD_STATUS)).toContainText(/confirmed/i, { timeout: 8000 })
  })

  test('a second score on a different match works identically (repeat-use loop)', async ({ page }) => {
    const owner = createTestUser()
    const bob = createTestUser()
    const carol = { ...createTestUser(), name: `Carol ${Date.now()}` }
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: bobId } = await signupAndGetToken(bob)
    const { playerId: carolId } = await signupAndGetToken(carol)
    const groupId = await createGroup(ownerToken, `Coach Repeat Group ${Date.now()}`)
    await seedCasualSession(groupId, [ownerPlayerId, bobId])
    await seedCasualSession(groupId, [ownerPlayerId, carolId])

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await sendCoachMessage(page, `@coach beat ${bob.name} 6-4, 6-3`)
    await waitForActionCard(page)
    await page.locator(SELECTORS.ACTION_CARD).last().locator(SELECTORS.ACTION_CARD_CONFIRM_BUTTON).click()
    await expect(page.locator(SELECTORS.ACTION_CARD_STATUS).last()).toContainText(/confirmed/i, { timeout: 8000 })

    await sendCoachMessage(page, `@coach beat ${carol.name} 6-2, 6-1`)
    await expect(page.locator(SELECTORS.ACTION_CARD)).toHaveCount(2, { timeout: 8000 })
    await page.locator(SELECTORS.ACTION_CARD).last().locator(SELECTORS.ACTION_CARD_CONFIRM_BUTTON).click()
    await expect(page.locator(SELECTORS.ACTION_CARD_STATUS).last()).toContainText(/confirmed/i, { timeout: 8000 })
  })

  test('a different member sees the card but cannot confirm it (proposer-only)', async ({ page, browser }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { token: opponentToken, playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const { groupId } = await createGroupWithMember(ownerToken, `Coach Bystander Group ${Date.now()}`, opponent)
    await seedCasualSession(groupId, [ownerPlayerId, opponentPlayerId])

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await sendCoachMessage(page, `@coach beat ${opponent.name} 6-4, 6-3`)
    await waitForActionCard(page)

    const bystanderContext = await browser.newContext()
    const bystanderPage = await bystanderContext.newPage()
    await loginFrontend(bystanderPage, opponentToken)
    await bystanderPage.goto(`http://localhost:5173/groups/${groupId}`)

    await waitForActionCard(bystanderPage)
    await expect(bystanderPage.locator(SELECTORS.ACTION_CARD_CONFIRM_BUTTON)).toHaveCount(0)
    await bystanderContext.close()
  })

  test('proposer dismisses a card → it renders cancelled for every member live', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Coach Dismiss Group ${Date.now()}`)
    await seedCasualSession(groupId, [ownerPlayerId, opponentPlayerId])

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await sendCoachMessage(page, `@coach beat ${opponent.name} 6-4, 6-3`)
    await waitForActionCard(page)

    const card = page.locator(SELECTORS.ACTION_CARD).last()
    await card.locator(SELECTORS.ACTION_CARD_DISMISS_BUTTON).click()
    await expect(card.locator(SELECTORS.ACTION_CARD_STATUS)).toContainText(/dismiss|cancel/i, { timeout: 8000 })
  })

  test('NEGATIVE — ambiguous opponent name yields a clarifying question, never a guess', async ({ page }) => {
    const owner = createTestUser()
    const sunilA = { ...createTestUser(), name: `Sunil A ${Date.now()}` }
    const sunilB = { ...createTestUser(), name: `Sunil B ${Date.now()}` }
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: sunilAId } = await signupAndGetToken(sunilA)
    const { playerId: sunilBId } = await signupAndGetToken(sunilB)
    const groupId = await createGroup(ownerToken, `Coach Ambiguous Group ${Date.now()}`)
    await seedCasualSession(groupId, [ownerPlayerId, sunilAId])
    await seedCasualSession(groupId, [ownerPlayerId, sunilBId])

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)
    await sendCoachMessage(page, '@coach beat Sunil 6-4, 6-3')

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toContainText(/sunil/i)
    await expect(page.locator(SELECTORS.ACTION_CARD)).toHaveCount(0)
  })

  test('casual launch via Coach: poll creator drafts, confirms via the sheet, tournament is created', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { groupId } = await createGroupWithMember(ownerToken, `Coach Launch Group ${Date.now()}`, opponent)

    // Seed a poll and close it via the real API (not the assistant) — the
    // draft-time check is "who created THIS poll", set up out of band.
    const pollRes = await apiCall(
      `/player/groups/${groupId}/polls`,
      'POST',
      { question: `Saturday session? ${Date.now()}`, targetTime: new Date(Date.now() + 3600_000).toISOString() },
      ownerToken
    )
    expect(pollRes.ok).toBe(true)
    const { messageId: pollMessageId } = await pollRes.json()
    const closeRes = await apiCall(`/player/groups/${groupId}/polls/${pollMessageId}/close`, 'POST', {}, ownerToken)
    expect(closeRes.ok).toBe(true)

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await sendCoachMessage(page, '@coach launch a session for everyone who voted in')
    await waitForActionCard(page)

    const card = page.locator(SELECTORS.ACTION_CARD).last()
    await expect(card.locator(SELECTORS.ACTION_CARD_LAUNCH_BUTTON)).toBeVisible()
    await card.locator(SELECTORS.ACTION_CARD_LAUNCH_BUTTON).click()

    await expect(page.locator(SELECTORS.LAUNCH_CONFIRM_SHEET)).toBeVisible()
    await page.locator(SELECTORS.LAUNCH_CONFIRM_BUTTON).click()

    // Confirming navigates to the new tournament's detail page
    await expect(page).toHaveURL(/\/tournament\//, { timeout: 8000 })
  })

  test('NEGATIVE — a non-creator asking Coach to launch gets a polite decline, no card', async ({ page }) => {
    const owner = createTestUser()
    const member = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const { token: memberToken, groupId } = await (async () => {
      const { groupId, memberPlayerId } = await createGroupWithMember(
        ownerToken,
        `Coach Launch Decline Group ${Date.now()}`,
        member
      )
      void memberPlayerId
      // Re-derive the member's own token (createGroupWithMember only returns the id)
      const { token } = await signupAndGetToken(member)
      return { token, groupId }
    })()

    const pollRes = await apiCall(
      `/player/groups/${groupId}/polls`,
      'POST',
      { question: `Owner-only poll ${Date.now()}`, targetTime: new Date(Date.now() + 3600_000).toISOString() },
      ownerToken
    )
    expect(pollRes.ok).toBe(true)
    const { messageId: pollMessageId } = await pollRes.json()
    await apiCall(`/player/groups/${groupId}/polls/${pollMessageId}/close`, 'POST', {}, ownerToken)

    await loginFrontend(page, memberToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await sendCoachMessage(page, '@coach launch a session for everyone who voted in')

    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toBeVisible({ timeout: 8000 })
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toContainText(/poll creator/i)
    await expect(page.locator(SELECTORS.ACTION_CARD)).toHaveCount(0)
  })
})
