/**
 * Player Personalization (P12) — Coach availability E2E test
 *
 * See e2e-scenarios.md "Player Personalization (P0-P12)" scenario (12):
 * seed two players' grids, ask "@coach when can we play?", and the reply
 * contains "N of M" with neither player's name tied to a slot.
 *
 * Run: npx playwright test personalization-availability
 */

import { test, expect } from '@playwright/test'
import { apiCall, createTestUser } from './fixtures'
import { API_CONFIG } from './config'

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

/** Invite + accept (assistant-actions.spec.ts's createGroupWithMember pattern) — accept mints the invitee's own session token. */
async function inviteAndJoin(groupId: string, ownerToken: string, invitee: { email: string; name: string }): Promise<string> {
  const inviteRes = await apiCall(`/player/groups/${groupId}/invites`, 'POST', { email: invitee.email }, ownerToken)
  if (!inviteRes.ok) throw new Error(`invite failed: ${await inviteRes.text()}`)
  const { rawToken } = await inviteRes.json()

  const dob = new Date()
  dob.setFullYear(dob.getFullYear() - 25)
  const acceptRes = await apiCall(`/player/groups/${groupId}/invites/accept`, 'POST', {
    token: rawToken,
    email: invitee.email,
    name: invitee.name,
    ageAttestation: { dateOfBirth: dob.toISOString().slice(0, 10), policyVersion: 'v1' },
  })
  if (!acceptRes.ok) throw new Error(`invite accept failed: ${await acceptRes.text()}`)
  const acceptBody = await acceptRes.json()
  return acceptBody.token as string
}

async function setAvailability(token: string, slots: Array<{ weekday: number; dayPart: string }>): Promise<void> {
  const res = await apiCall('/api/auth/me/availability', 'PUT', { slots }, token)
  if (!res.ok) throw new Error(`availability PUT failed: ${await res.text()}`)
}

async function sendMessage(groupId: string, token: string, body: string): Promise<void> {
  const res = await apiCall(`/player/groups/${groupId}/messages`, 'POST', { body }, token)
  if (!res.ok) throw new Error(`message post failed: ${await res.text()}`)
}

/** The assistant.reply job runs fire-and-forget off the request path — poll until it lands. */
async function lastAssistantMessage(groupId: string, token: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await apiCall(`/player/groups/${groupId}/messages`, 'GET', undefined, token)
    if (!res.ok) throw new Error(`messages fetch failed: ${await res.text()}`)
    const data = await res.json()
    const assistantMessages = data.messages.filter((m: any) => m.type === 'assistant')
    if (assistantMessages.length > 0) {
      return assistantMessages[assistantMessages.length - 1].body as string
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('No assistant message appeared within the polling window')
}

test.describe('Player Personalization — Coach availability (P12, scenario 12)', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('"@coach when can we play?" replies with counts only, never a player\'s name', async () => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken } = await signupAndGetToken(owner)
    const groupId = await createGroup(ownerToken, `Availability Group ${Date.now()}`)
    const opponentToken = await inviteAndJoin(groupId, ownerToken, opponent)

    await setAvailability(ownerToken, [{ weekday: 6, dayPart: 'morning' }])
    await setAvailability(opponentToken, [{ weekday: 6, dayPart: 'morning' }])

    await sendMessage(groupId, ownerToken, '@coach when can we play?')

    const body = await lastAssistantMessage(groupId, ownerToken)
    expect(body).toMatch(/\d+ of \d+/)
    expect(body).not.toContain(owner.name)
    expect(body).not.toContain(opponent.name)
  })
})
