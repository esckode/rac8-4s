/**
 * Player Personalization (P11) — digest rank-movement E2E test
 *
 * See e2e-scenarios.md "Player Personalization (P0-P12)" scenario (10),
 * movement half: two /test/digest-sweep runs with a score change between
 * and forced different ISO weeks produces a rank-movement line in the
 * second week's digest.
 *
 * Run: npx playwright test personalization-digest-movement
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

async function signupAndGetToken(user: { email: string; name: string; password: string }, tournamentId?: string) {
  const res = await apiCall('/test/player-token', 'POST', { email: user.email, name: user.name, tournamentId })
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

async function setDigestEnabled(groupId: string, token: string, enabled: boolean): Promise<void> {
  const res = await apiCall(`/player/groups/${groupId}`, 'PATCH', { digestEnabled: enabled }, token)
  if (!res.ok) throw new Error(`digest toggle failed: ${await res.text()}`)
}

async function seedScheduledSession(groupId: string, playerIds: string[], hoursUntilDeadline: number): Promise<string> {
  const res = await apiCall('/test/scheduled-session', 'POST', { groupId, playerIds, hoursUntilDeadline })
  if (!res.ok) throw new Error(`scheduled-session seed failed: ${await res.text()}`)
  const data = await res.json()
  return data.tournamentId as string
}

async function getOnlyMatch(tournamentId: string, token: string): Promise<{ id: string }> {
  const res = await apiCall(`/tournaments/${tournamentId}/bundle`, 'GET', undefined, token)
  if (!res.ok) throw new Error(`bundle failed: ${await res.text()}`)
  const bundle = await res.json()
  return bundle.matches.group[0]
}

async function submitScore(tournamentId: string, matchId: string, score: string, token: string): Promise<void> {
  const res = await apiCall(`/tournaments/${tournamentId}/matches/${matchId}/score`, 'POST', { score }, token)
  if (!res.ok) throw new Error(`score submit failed: ${await res.text()}`)
}

async function editScore(tournamentId: string, matchId: string, score: string, token: string): Promise<void> {
  const res = await apiCall(`/tournaments/${tournamentId}/matches/${matchId}/score`, 'PATCH', { score }, token)
  if (!res.ok) throw new Error(`score edit failed: ${await res.text()}`)
}

async function runDigestSweep(now: string): Promise<void> {
  const res = await apiCall('/test/digest-sweep', 'POST', { now })
  if (!res.ok) throw new Error(`digest-sweep trigger failed: ${await res.text()}`)
}

async function lastAssistantMessage(groupId: string, token: string): Promise<string> {
  const res = await apiCall(`/player/groups/${groupId}/messages`, 'GET', undefined, token)
  if (!res.ok) throw new Error(`messages fetch failed: ${await res.text()}`)
  const data = await res.json()
  const assistantMessages = data.messages.filter((m: any) => m.type === 'assistant')
  return assistantMessages[assistantMessages.length - 1].body as string
}

test.describe('Player Personalization — digest rank movement (P11, scenario 10)', () => {
  test.beforeEach(async () => {
    if (!(await serversRunning())) {
      test.skip()
    }
  })

  test('a rank change between two weekly digests produces a movement line in the second one', async () => {
    const owner = createTestUser()
    const opponent = createTestUser()
    const { token: ownerToken, playerId: ownerPlayerId } = await signupAndGetToken(owner)
    const { playerId: opponentPlayerId } = await signupAndGetToken(opponent)
    const groupId = await createGroup(ownerToken, `Digest Movement Group ${Date.now()}`)
    await setDigestEnabled(groupId, ownerToken, true)

    const tournamentId = await seedScheduledSession(groupId, [ownerPlayerId, opponentPlayerId], 200)
    const { token: scopedOwnerToken } = await signupAndGetToken(owner, tournamentId)
    const match = await getOnlyMatch(tournamentId, scopedOwnerToken)

    // Week 1: owner wins, rank 1.
    await submitScore(tournamentId, match.id, '6-4, 6-3', scopedOwnerToken)
    const week1 = '2026-07-12T18:00:00Z' // Sunday 18:00 UTC (no group tz set -> fallback window)
    await runDigestSweep(week1)

    // Correct the score before week 2 so the opponent now wins - a genuine
    // rank flip with only 2 players (no round-robin tie risk).
    await editScore(tournamentId, match.id, '4-6, 3-6', scopedOwnerToken)
    const week2 = '2026-07-19T18:00:00Z' // exactly 7 days later -> next ISO week
    await runDigestSweep(week2)

    const body = await lastAssistantMessage(groupId, ownerToken)
    expect(body).toMatch(/rank changes/i)
    expect(body).toMatch(/1st/)
  })
})
