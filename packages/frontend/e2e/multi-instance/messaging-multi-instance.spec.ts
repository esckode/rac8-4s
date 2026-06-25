/**
 * Multi-instance messaging e2e — V2.2
 *
 * Validates distributed behaviour when two API instances sit behind a non-sticky
 * round-robin nginx load balancer at :4000.
 *
 * Prerequisites: distributed stack must be running (`npm run dev:distributed`).
 * This file is part of the `messaging-multi-instance` Playwright project and is
 * NOT included in the default single-instance suite (playwright.config.ts).
 *
 * Scenarios:
 *   1. Cross-node SSE delivery — proves the Redis pub/sub bus relays events
 *      across API instances (R-17.3).
 *   2. Auth across instances — proves the Redis token store prevents 401s under
 *      round-robin LB (R-17.10.1).
 *   3. Read-receipt flush by BullMQ worker — proves the async job pipeline works
 *      end-to-end (R-17.1.3).
 */

import { test, expect } from '@playwright/test'
import http from 'node:http'

// ─── Config ──────────────────────────────────────────────────────────────────

const LB_URL = process.env.LB_URL ?? 'http://localhost:4000'
const API_A = process.env.API_A_URL ?? 'http://localhost:3001'
const API_B = process.env.API_B_URL ?? 'http://localhost:3002'
const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-key-change-in-production'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiCall(
  base: string,
  path: string,
  method: string,
  body?: unknown,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function future(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

/** Sign a minimal organizer JWT — stateless, so no token store needed. */
function signOrganizerJwt(sub: string): string {
  // Node's crypto can sign HS256 without the `jsonwebtoken` package.
  const { createHmac } = require('node:crypto')
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ sub, email: `${sub}@test.local`, role: 'organizer', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url')
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${sig}`
}

/** Open a Server-Sent Events connection to a URL and collect events for `durationMs`. */
function collectSSEEvents(
  url: string,
  durationMs: number
): Promise<{ event: string; data: string }[]> {
  return new Promise((resolve, reject) => {
    const events: { event: string; data: string }[] = []
    const parsed = new URL(url)
    const opts: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parseInt(parsed.port || '80', 10),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
    }

    const req = http.get(opts, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`SSE connect failed: ${res.statusCode} to ${url}`))
      }
      let buf = ''
      let currentEvent = 'message'

      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buf += chunk
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            events.push({ event: currentEvent, data: line.slice(5).trim() })
            currentEvent = 'message'
          }
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)

    setTimeout(() => {
      req.destroy()
      resolve(events)
    }, durationMs)
  })
}

/** Seed a tournament + conversation directly via the API (no DB client needed). */
async function seedTournament(organizerToken: string, base: string = LB_URL) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const orgId = `mi-org-${suffix}`

  // Create via API (uses the organizer JWT)
  const create = await apiCall(base, '/tournaments', 'POST', {
    name: `MI Test ${suffix}`,
    sport: 'pickleball',
    matchFormat: 'singles',
    maxPlayers: 16,
    registrationDeadline: future(1),
    groupStageDeadline: future(2),
    knockoutStageDeadline: future(3),
  }, organizerToken)

  if (!create.ok) {
    throw new Error(`Failed to create tournament: ${create.status} ${await create.text()}`)
  }
  const { id: tournamentId } = await create.json()

  // Open registration
  const open = await apiCall(base, `/tournaments/${tournamentId}/advance`, 'POST', { action: 'OPEN_REGISTRATION' }, organizerToken)
  if (!open.ok) throw new Error(`Failed to open registration: ${open.status} ${await open.text()}`)

  return { tournamentId }
}

/** Register a player and exchange magic-link token for a player-session token. */
async function registerPlayer(
  tournamentId: string,
  base: string = LB_URL
): Promise<{ playerToken: string; playerId: string }> {
  const suffix = Date.now() + Math.random().toString(36).slice(2, 6)
  const email = `player-mi-${suffix}@test.local`
  const name = `Player MI ${suffix}`

  const reg = await apiCall(base, `/tournaments/${tournamentId}/register`, 'POST', { email, name })
  if (!reg.ok) throw new Error(`Failed to register: ${reg.status} ${await reg.text()}`)
  const { magicLinkToken } = await reg.json()

  const verify = await apiCall(
    base,
    `/tournaments/${tournamentId}/auth/verify?token=${encodeURIComponent(magicLinkToken)}`,
    'GET'
  )
  if (!verify.ok) throw new Error(`Failed to verify: ${verify.status} ${await verify.text()}`)
  const { playerToken, playerId } = await verify.json()
  return { playerToken, playerId }
}

// ─── Stack check ─────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Fail fast with a clear message if the distributed stack is not running.
  for (const [label, url] of [
    ['LB:4000', `${LB_URL}/health`],
    ['API-A:3001', `${API_A}/health`],
    ['API-B:3002', `${API_B}/health`],
  ]) {
    const res = await fetch(url).catch(() => null)
    if (!res || !res.ok) {
      throw new Error(
        `${label} not reachable at ${url}. ` +
        'Run `npm run dev:distributed` before executing this test project.'
      )
    }
  }
})

// ─── Scenario 1: Cross-node SSE ──────────────────────────────────────────────

test('Cross-node SSE delivery via load balancer', async () => {
  /**
   * Proof: an SSE client receives a "message.created" event even when the
   * announcement is posted to a *different* API instance than the one serving
   * the SSE connection.  Both instances share the Redis pub/sub bus.
   *
   * Approach: open one SSE stream, wait for it to attach, post an announcement,
   * wait for relay, assert the event arrived.  Because the LB is round-robin,
   * over repeated requests the announcement is statistically likely to land on
   * the other instance.  To make this deterministic we post directly to API-A
   * and open the SSE stream directly to API-B.
   */
  const orgSub = `mi-org-crossnode-${Date.now()}`
  const token = signOrganizerJwt(orgSub)

  // Seed the tournament via API-A so the conversation exists.
  const { tournamentId } = await seedTournament(token, API_A)

  // Open SSE on API-B (different instance from where we will POST).
  const sseUrl = `${API_B}/tournaments/${tournamentId}/events?token=${encodeURIComponent(token)}`

  // Start collecting events (5 s window).
  const eventsPromise = collectSSEEvents(sseUrl, 5000)

  // Give SSE time to attach and subscribe to the Redis channel.
  await new Promise((r) => setTimeout(r, 1500))

  // Post the announcement directly to API-A.
  const body = `cross-node-test-${Date.now()}`
  const announce = await apiCall(
    API_A,
    `/tournaments/${tournamentId}/announcements`,
    'POST',
    { body },
    token
  )
  expect(announce.status, `Announcement POST to API-A failed: ${await announce.clone().text()}`).toBe(201)

  // Wait for collection window to close.
  const events = await eventsPromise

  const matched = events.find(
    (e) => e.event === 'message.created' && e.data.includes(body)
  )
  expect(
    matched,
    `Expected a message.created event containing "${body}" on API-B but got: ${JSON.stringify(events)}`
  ).toBeTruthy()
})

// ─── Scenario 2: Auth across instances ───────────────────────────────────────

test('Player-session auth works across round-robined instances', async () => {
  /**
   * Proof: player-session tokens are stored in Redis (RedisTokenStore) and are
   * therefore shared across instances.  A token obtained via one instance is
   * valid on another — no random 401s under round-robin LB.
   *
   * We make 10 authenticated requests through the LB (round-robin) and assert
   * that all 10 return 2xx.  The history endpoint is a cheap read that exercises
   * the token-store lookup on every request.
   */
  const orgSub = `mi-org-auth-${Date.now()}`
  const orgToken = signOrganizerJwt(orgSub)

  // Seed via API-A.
  const { tournamentId } = await seedTournament(orgToken, API_A)

  // Register a player and get their session token — also via API-A.
  const { playerToken } = await registerPlayer(tournamentId, API_A)

  // Now make 10 requests through the LB (round-robin hits both instances).
  const results: number[] = []
  for (let i = 0; i < 10; i++) {
    const res = await apiCall(LB_URL, `/tournaments/${tournamentId}/messages`, 'GET', undefined, playerToken)
    results.push(res.status)
  }

  const failures = results.filter((s) => s === 401)
  expect(
    failures.length,
    `Got ${failures.length} × 401 in 10 requests via LB.  Status codes: ${results.join(', ')}`
  ).toBe(0)

  const successes = results.filter((s) => s === 200)
  expect(successes.length, `Expected 10 × 200 but got: ${results.join(', ')}`).toBe(10)
})

// ─── Scenario 3: Job processing — read-receipt flush ─────────────────────────

test('Read-receipt flush processed by BullMQ worker', async () => {
  /**
   * Proof: POST /:id/messages/:msgId/read enqueues a messaging.read_receipt.flush
   * job in BullMQ, which the worker processes.  After a short delay, GET history
   * returns the message with read_at set.
   *
   * Flow:
   *   1. Organizer sends an announcement (creates a message + recipient row).
   *   2. Player marks it read via the LB.
   *   3. Wait for the BullMQ worker to process the job (up to 8 s).
   *   4. Assert GET /messages returns the message with read_at != null.
   */
  const orgSub = `mi-org-rr-${Date.now()}`
  const orgToken = signOrganizerJwt(orgSub)

  // Seed via LB (round-robin).
  const { tournamentId } = await seedTournament(orgToken, LB_URL)

  // Register a player via LB.
  const { playerToken } = await registerPlayer(tournamentId, LB_URL)

  // Organizer sends a broadcast.
  const msgBody = `rr-test-msg-${Date.now()}`
  const announce = await apiCall(LB_URL, `/tournaments/${tournamentId}/announcements`, 'POST', { body: msgBody }, orgToken)
  expect(announce.status, `Announcement failed: ${await announce.clone().text()}`).toBe(201)
  const { message } = await announce.json()
  const messageId: string = message.id

  // Player marks it read via LB.
  const markRead = await apiCall(
    LB_URL,
    `/tournaments/${tournamentId}/messages/${messageId}/read`,
    'POST',
    undefined,
    playerToken
  )
  expect(markRead.status, `Mark-read failed: ${markRead.status}`).toBe(204)

  // Poll GET /messages until read_at is set (worker must flush in ≤ 8 s).
  const deadline = Date.now() + 8000
  let readAt: string | null = null
  while (Date.now() < deadline) {
    const hist = await apiCall(LB_URL, `/tournaments/${tournamentId}/messages`, 'GET', undefined, playerToken)
    if (hist.ok) {
      const body = await hist.json()
      // History endpoint returns { messages: [...] }
      const msgs: any[] = Array.isArray(body) ? body : (body.messages ?? [])
      const found = msgs.find((m: any) => m.id === messageId)
      if (found?.read_at) {
        readAt = found.read_at
        break
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  expect(
    readAt,
    `Expected message ${messageId} to have read_at set within 8 s after mark-read (BullMQ worker must be running)`
  ).not.toBeNull()
})

// ─── Scenario 5: Standings cache consistency across instances (R-17.10.3) ────

test('Standings are fresh on instance B after a score write on instance A', async () => {
  /**
   * Proof: when a score is submitted on instance A, the standings.invalidate event
   * is published on the broadcast bus so that every instance drops the affected
   * group from its InMemoryStandingsCache.  The next read on instance B must
   * reflect the new result (no stale cached standings).
   *
   * Flow:
   *   1. Organizer seeds a tournament via API-A and advances it to group_stage_active.
   *   2. Two players register and receive player-session tokens (Redis token store).
   *   3. Each player's match is fetched; we identify the group match between them.
   *   4. Player 1 submits a score on API-A directly.
   *   5. The bundle endpoint is called on API-B directly.
   *   6. The standings for the group must show player 1 as the winner (non-zero wins),
   *      proving instance B did not serve a stale cached result that pre-dated the score.
   */
  const orgSub = `mi-org-standings-${Date.now()}`
  const orgToken = signOrganizerJwt(orgSub)

  // 1. Create tournament via API-A
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const createRes = await apiCall(API_A, '/tournaments', 'POST', {
    name: `Standings MI ${suffix}`,
    sport: 'pickleball',
    matchFormat: 'singles',
    maxPlayers: 16,
    registrationDeadline: future(1),
    groupStageDeadline: future(2),
    knockoutStageDeadline: future(3),
  }, orgToken)
  expect(createRes.status, `Create tournament failed: ${await createRes.clone().text()}`).toBe(201)
  const { id: tournamentId } = await createRes.json()

  // OPEN_REGISTRATION
  const openRes = await apiCall(API_A, `/tournaments/${tournamentId}/advance`, 'POST', { action: 'OPEN_REGISTRATION' }, orgToken)
  expect(openRes.status, `Open registration failed: ${await openRes.clone().text()}`).toBe(200)

  // 2. Register two players via API-A
  const { playerToken: p1Token, playerId: p1Id } = await registerPlayer(tournamentId, API_A)
  const { playerToken: p2Token, playerId: p2Id } = await registerPlayer(tournamentId, API_A)

  // CLOSE_REGISTRATION then create groups (transitions to group_stage_active)
  const closeRes = await apiCall(API_A, `/tournaments/${tournamentId}/advance`, 'POST', { action: 'CLOSE_REGISTRATION' }, orgToken)
  expect(closeRes.status, `Close registration failed: ${await closeRes.clone().text()}`).toBe(200)

  const groupsRes = await apiCall(API_A, `/tournaments/${tournamentId}/groups`, 'POST', {
    numGroups: 1,
    advancingPerGroup: 1,
  }, orgToken)
  expect(groupsRes.status, `Create groups failed: ${await groupsRes.clone().text()}`).toBe(201)
  const { groups } = await groupsRes.json()
  const groupId: string = groups[0].id

  // 3. Find the match between the two players by fetching player 1's matches via API-A
  const matchesRes = await apiCall(API_A, `/tournaments/${tournamentId}/matches`, 'GET', undefined, p1Token)
  expect(matchesRes.status, `Get matches failed: ${await matchesRes.clone().text()}`).toBe(200)
  const { matches } = await matchesRes.json()
  const groupMatch = (matches as any[]).find(
    (m) => m.type === 'group' && (m.player2_id === p2Id || m.player1_id === p2Id)
  )
  expect(groupMatch, `No group match found between p1 and p2 in: ${JSON.stringify(matches)}`).toBeDefined()
  const matchId: string = groupMatch.id

  // 4. Player 1 submits a winning score on API-A
  const scoreRes = await apiCall(
    API_A,
    `/tournaments/${tournamentId}/matches/${matchId}/score`,
    'POST',
    { score: '11-5 11-3' },
    p1Token
  )
  expect(scoreRes.status, `Score submission failed: ${await scoreRes.clone().text()}`).toBe(200)

  // 5. Read the bundle (standings) from API-B
  const bundleRes = await apiCall(
    API_B,
    `/tournaments/${tournamentId}/bundle?include=standings`,
    'GET',
    undefined,
    p1Token
  )
  expect(bundleRes.status, `Bundle read on API-B failed: ${await bundleRes.clone().text()}`).toBe(200)
  const bundle = await bundleRes.json()

  // 6. Find the standings for the group and verify player 1 has wins > 0
  const groupStandings = (bundle.standings as any[])?.find((g: any) => g.groupId === groupId)
  expect(groupStandings, `Group ${groupId} not found in standings: ${JSON.stringify(bundle.standings)}`).toBeDefined()

  const p1Standing = groupStandings.standings.find((s: any) => s.playerId === p1Id)
  expect(
    p1Standing?.wins,
    `Expected player 1 to have ≥ 1 win on API-B after scoring on API-A, but got: ${JSON.stringify(p1Standing)}`
  ).toBeGreaterThanOrEqual(1)
})

// ─── Scenario 4: Shared rate limit across instances ───────────────────────────

test('Rate limit enforced across round-robined instances (shared Redis counter)', async () => {
  /**
   * Proof: the Redis-backed rate-limit counter (RedisCounterStore) is shared across
   * instances.  Without Redis, each instance has its own in-memory counter; a client
   * could double the effective limit by round-robining across 2 instances.
   *
   * Approach: send all failed login attempts through the load balancer (round-robin)
   * so they are distributed across both instances.  The rate-limit key includes the
   * client IP — which is the nginx LB container's IP from the perspective of each API
   * instance.  Since both instances share the same Redis counter, the cumulative
   * failure count reaches maxAttempts regardless of which instance served each request.
   *
   * We use a non-existent account email so every attempt is a 401 (counts as a failure).
   * maxAttempts for login is 5 (APP_LIMITS_RATE_LIMIT_LOGIN_MAX_ATTEMPTS default).
   */
  const suffix = `rl-mi-${Date.now()}`
  const email = `rate-limit-mi-${suffix}@test.local`
  const password = 'some-wrong-password'

  // First 4 attempts via the LB (round-robin across both instances).
  // Each should be 401 (unauthorized) — the counter increments on each failure.
  for (let i = 1; i <= 4; i++) {
    const res = await apiCall(LB_URL, '/api/auth/login', 'POST', { email, password })
    expect(
      res.status,
      `Expected 401/400 on attempt #${i} via LB, got ${res.status}: ${await res.clone().text()}`
    ).toBeLessThan(429)
  }

  // 5th attempt via the LB — shared Redis counter has reached maxAttempts (5).
  // Both instances see the same counter, so the 5th request returns 429.
  const final = await apiCall(LB_URL, '/api/auth/login', 'POST', { email, password })
  expect(
    final.status,
    `Expected 429 on the 5th combined failure across LB-distributed instances, got ${final.status}: ${await final.clone().text()}`
  ).toBe(429)

  const body = await final.json()
  expect(body.code).toBe('RATE_LIMITED')
})
