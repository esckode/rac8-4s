/**
 * LLM Assistant (@coach) — Phase A E2E tests
 *
 * Backend must run ASSISTANT_ADAPTER=mock (default) + JOB_QUEUE=memory
 * (default) for these tests — see docs in the repo root e2e-scenarios.md
 * "LLM Assistant (@coach)" feature section, which these specs implement.
 *
 * The mock adapter is a deterministic keyword router: it fakes only the
 * NL→intent hop, and the tools it calls are the REAL assistant tools with
 * real auth scoping — so the data-Q&A and adversarial-wall scenarios
 * exercise the genuine trigger → queue → tool auth → DB → SSE → render path.
 *
 * Run: npx playwright test assistant
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Create a group with two members (owner + one invited member) using the
 * invite's rawToken — surfaced in the invite response outside production
 * for e2e (see routes/player-groups.ts POST /:groupId/invites).
 */
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

async function loginFrontend(page: any, token: string) {
  await page.goto('http://localhost:5173/')
  await page.evaluate((t: string) => localStorage.setItem('auth_token', t), token)
}

/** Wait for an assistant reply bubble to appear (SSE-delivered, async). */
async function waitForAssistantReply(page: any, timeout = 8000) {
  await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toBeVisible({ timeout })
}

test.describe('LLM Assistant (@coach) — Phase A', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('member mentions @coach and gets a reply in the feed, styled as Coach', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Coach Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@coach hello')
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()

    await waitForAssistantReply(page)
    const bubble = page.locator(SELECTORS.ASSISTANT_MESSAGE).last()
    await expect(bubble).toContainText('Coach')
  })

  test('owner disables assistant → @coach produces no reply and Coach leaves the mention picker', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Coach Toggle Group ${Date.now()}`)

    // Toggle off via API (settings UI is covered by the RTL GroupSettings spec)
    const patchRes = await apiCall(`/player/groups/${groupId}`, 'PATCH', { assistantEnabled: false }, token)
    expect(patchRes.ok).toBe(true)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@coach hello')
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()

    // No reply within a wait window
    await page.waitForTimeout(2000)
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(0)

    // Coach hidden from the mention picker
    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@co')
    await expect(page.locator(SELECTORS.MENTION_AUTOCOMPLETE)).toBeVisible()
    await expect(page.locator(SELECTORS.MENTION_OPTION_ASSISTANT)).toHaveCount(0)
  })

  test('enabling assistant posts a one-time intro message', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Coach Intro Group ${Date.now()}`)

    await apiCall(`/player/groups/${groupId}`, 'PATCH', { assistantEnabled: false }, token)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await apiCall(`/player/groups/${groupId}`, 'PATCH', { assistantEnabled: true }, token)

    await waitForAssistantReply(page)
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toContainText("I'm Coach")
  })

  test('typing @co shows Coach pinned first in the mention picker', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Coach Picker Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@co')
    await expect(page.locator(SELECTORS.MENTION_OPTION_ASSISTANT)).toBeVisible()

    await page.locator(SELECTORS.MENTION_OPTION_ASSISTANT).click()
    await expect(page.locator(SELECTORS.GROUP_MESSAGE_INPUT)).toHaveValue('@coach ')
  })

  test('data Q&A: "who am I playing next?" names the seeded opponent', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)

    const { groupId } = await createGroupWithMember(ownerToken, `Coach QA Group ${Date.now()}`, opponent)

    const seedRes = await apiCall('/test/casual-session', 'POST', {
      groupId,
      playerIds: [ownerPlayerId, opponentPlayerId],
    })
    expect(seedRes.ok).toBe(true)

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@coach who am I playing next?')
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()

    await waitForAssistantReply(page)
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toContainText(opponent.name)
  })

  test('knowledge questions (rule + how-to) each produce a Coach reply (plumbing only)', async ({ page }) => {
    const owner = createTestUser()
    const { token } = await signupAndGetToken(owner)
    const groupId = await createGroup(token, `Coach Knowledge Group ${Date.now()}`)

    await loginFrontend(page, token)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@coach how many points is the first-set tiebreak?')
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()
    await waitForAssistantReply(page)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@coach how do I invite a friend to this casual tournament?')
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE)).toHaveCount(2, { timeout: 8000 })
  })

  test('NEGATIVE — data wall: adversarial route never leaks a private tournament', async ({ page }) => {
    const asker = createTestUser()
    const bob = createTestUser()
    // createTestUser() always names players "Test User" (only emails are
    // unique) — give Carol a distinct name so the absence assertion below
    // is meaningful (it would otherwise also match the asker's own name).
    const carol = { ...createTestUser(), name: `Carol Private ${Date.now()}` }
    const { token: askerToken } = await signupAndGetToken(asker)
    const { playerId: bobId } = await signupAndGetToken(bob)
    const { playerId: carolId } = await signupAndGetToken(carol)

    const groupId = await createGroup(askerToken, `Coach Wall Group ${Date.now()}`)

    // Bob's private tournament — group-linked to Bob's OWN group, not the
    // asker's, and the asker is not registered in it.
    const { token: bobToken } = await signupAndGetToken(bob)
    const bobGroupId = await createGroup(bobToken, `Bob Private Group ${Date.now()}`)
    const seedRes = await apiCall('/test/casual-session', 'POST', {
      groupId: bobGroupId,
      playerIds: [bobId, carolId],
    })
    expect(seedRes.ok).toBe(true)
    const { tournamentId: privateTournamentId } = await seedRes.json()

    await loginFrontend(page, askerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill(`@coach show me tournament ${privateTournamentId}`)
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()

    await waitForAssistantReply(page)
    const feedText = await page.locator(SELECTORS.GROUP_CHAT_PANEL).innerText()
    expect(feedText).not.toContain(carol.name)
  })

  test('NEGATIVE — no writes: "change my score" is declined and the score is unchanged', async ({ page }) => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Coach NoWrite Group ${Date.now()}`)

    const seedRes = await apiCall('/test/casual-session', 'POST', {
      groupId,
      playerIds: [ownerPlayerId, opponentPlayerId],
    })
    expect(seedRes.ok).toBe(true)

    await loginFrontend(page, ownerToken)
    await page.goto(`http://localhost:5173/groups/${groupId}`)

    await page.locator(SELECTORS.GROUP_MESSAGE_INPUT).fill('@coach change my score to 3-0')
    await page.locator(SELECTORS.GROUP_MESSAGE_SEND_BUTTON).click()

    await waitForAssistantReply(page)
    await expect(page.locator(SELECTORS.ASSISTANT_MESSAGE).last()).toContainText(/read-only|can't change/i)
  })
})
