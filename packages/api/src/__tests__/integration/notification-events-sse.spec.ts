/**
 * ISSUE-62 — GET /player/notifications/events: a per-player SSE stream that
 * pushes badge-relevant events so the Alerts/Groups nav badges update live,
 * without waiting for window refocus.
 *
 * Two event types travel this one channel (`player:<playerId>`, a synthetic
 * key distinct from any real conversation_id):
 *   - 'message.created' — postPersonalNotification's own write (Alerts badge).
 *   - 'group.unread.changed' — a new message landed in a group this player is
 *     a member of, fanned out to every OTHER member (Groups badge). The
 *     sender is excluded — their own badge doesn't need a nudge for a
 *     message they just sent.
 *
 * Mirrors the established SSE test pattern (group-events-sse-cap.spec.ts,
 * tournament-events-flush.spec.ts): raw http.get against a real
 * app.listen(0) server — supertest hangs forever on a successful (never
 * res.end()'d) SSE response.
 */
import http from 'http'
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { DEFAULT_APP_CONFIG } from '../../config'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { GroupMessageRepository } from '../../repositories/group-message-repository'
import { BroadcastBus } from '../../broadcast-bus'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string }> {
  const repo = new PlayerRepository(pool)
  const email = `sse-events-${uid()}@test.local`
  const player = await repo.findOrCreatePlayerByEmail(
    email, `Player ${uid()}`, undefined, undefined, defaultAdultAttestation()
  )
  return { id: player.id, email: player.email }
}

async function playerToken(player: { id: string; email: string }, tokenStore: InMemoryTokenStore): Promise<string> {
  const session = await generatePlayerSession(
    { playerId: player.id, tournamentId: crypto.randomUUID(), email: player.email, createdAt: Date.now() },
    3600,
    tokenStore
  )
  return session.token
}

describe('ISSUE-62 — GET /player/notifications/events', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let server: http.Server
  let port: number
  const MAX = 2
  const broadcastBus = new BroadcastBus()

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, {
      broadcastBus: broadcastBus as any,
      config: { limits: { ...DEFAULT_APP_CONFIG.limits, sseMaxConnectionsPerUser: MAX } },
    })
    app = deps.app
    tokenStore = deps.tokenStore
    server = app.listen(0)
    port = (server.address() as any).port
  })

  afterAll(async () => {
    server.close()
    await rollbackTransaction()
  })

  /** Opens a real SSE connection and resolves once headers arrive, WITHOUT destroying the socket. */
  function openStream(
    token: string
  ): Promise<{ status: number; req: http.ClientRequest; res?: http.IncomingMessage; body?: any }> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          host: 'localhost',
          port,
          path: '/player/notifications/events',
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          if ((res.statusCode ?? 0) >= 400) {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => {
              resolve({ status: res.statusCode ?? 0, req, body: data ? JSON.parse(data) : undefined })
            })
          } else {
            resolve({ status: res.statusCode ?? 0, req, res })
          }
        }
      )
      req.on('error', () => {
        // destroying an open stream's socket raises ECONNRESET; ignore it
      })
    })
  }

  /** Waits for a named SSE event on an open stream's response, or times out. */
  function waitForEvent(res: http.IncomingMessage, eventName: string, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      let buffer = ''
      const prefix = `event: ${eventName}\ndata: `
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${eventName}`)), timeoutMs)
      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const start = buffer.indexOf(prefix)
        if (start === -1) return
        const dataStart = start + prefix.length
        const end = buffer.indexOf('\n\n', dataStart)
        if (end === -1) return
        clearTimeout(timer)
        resolve(JSON.parse(buffer.slice(dataStart, end)))
      })
    })
  }

  it(`rejects the ${MAX + 1}th concurrent stream with 429, and closing one frees a slot`, async () => {
    const player = await createPlayer(pool)
    const token = await playerToken(player, tokenStore)

    const opened: http.ClientRequest[] = []
    for (let i = 0; i < MAX; i++) {
      const { status, req } = await openStream(token)
      expect(status).toBe(200)
      opened.push(req)
    }

    const overLimit = await openStream(token)
    expect(overLimit.status).toBe(429)
    expect(overLimit.body.code).toBe('TOO_MANY_REQUESTS')
    overLimit.req.destroy()

    // Free a slot by closing one of the held-open connections.
    opened[0].destroy()
    await new Promise((r) => setTimeout(r, 100))

    const afterFree = await openStream(token)
    expect(afterFree.status).toBe(200)
    afterFree.req.destroy()

    for (const req of opened.slice(1)) req.destroy()
    await new Promise((r) => setTimeout(r, 100))
  })

  it('delivers message.created when a personal notification is posted for this player', async () => {
    const player = await createPlayer(pool)
    const token = await playerToken(player, tokenStore)

    const { status, req, res } = await openStream(token)
    expect(status).toBe(200)

    const groupMsgRepo = new GroupMessageRepository(pool, broadcastBus)
    const eventPromise = waitForEvent(res!, 'message.created')
    await groupMsgRepo.postPersonalNotification(player.id, 'You were mentioned')

    const payload = await eventPromise
    expect(payload.body).toBe('You were mentioned')

    req.destroy()
  })

  it('delivers group.unread.changed to another member when a text message is posted, excluding the sender', async () => {
    const sender = await createPlayer(pool)
    const other = await createPlayer(pool)
    const senderTok = await playerToken(sender, tokenStore)
    const otherTok = await playerToken(other, tokenStore)

    const groupRes = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${senderTok}`)
      .send({ name: `SSE Push Group ${uid()}` })
    expect(groupRes.status).toBe(201)
    const groupId = groupRes.body.id as string

    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, other.id]
    )

    const otherStream = await openStream(otherTok)
    expect(otherStream.status).toBe(200)
    const senderStream = await openStream(senderTok)
    expect(senderStream.status).toBe(200)

    const otherEvent = waitForEvent(otherStream.res!, 'group.unread.changed')
    let senderGotUnreadEvent = false
    senderStream.res!.on('data', (chunk) => {
      if (chunk.toString().includes('group.unread.changed')) senderGotUnreadEvent = true
    })

    const msgRes = await request(app)
      .post(`/player/groups/${groupId}/messages`)
      .set('Authorization', `Bearer ${senderTok}`)
      .send({ body: 'Hello group' })
    expect(msgRes.status).toBe(201)

    const payload = await otherEvent
    expect(payload.groupId).toBe(groupId)
    expect(senderGotUnreadEvent).toBe(false)

    otherStream.req.destroy()
    senderStream.req.destroy()
  })

  it('delivers group.unread.changed to another member when a poll is created', async () => {
    const sender = await createPlayer(pool)
    const other = await createPlayer(pool)
    const senderTok = await playerToken(sender, tokenStore)
    const otherTok = await playerToken(other, tokenStore)

    const groupRes = await request(app)
      .post('/player/groups')
      .set('Authorization', `Bearer ${senderTok}`)
      .send({ name: `SSE Poll Push Group ${uid()}` })
    expect(groupRes.status).toBe(201)
    const groupId = groupRes.body.id as string

    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, other.id]
    )

    const otherStream = await openStream(otherTok)
    expect(otherStream.status).toBe(200)

    const otherEvent = waitForEvent(otherStream.res!, 'group.unread.changed')

    const pollRes = await request(app)
      .post(`/player/groups/${groupId}/polls`)
      .set('Authorization', `Bearer ${senderTok}`)
      .send({ question: 'Game tonight?' })
    expect(pollRes.status).toBe(201)

    const payload = await otherEvent
    expect(payload.groupId).toBe(groupId)

    otherStream.req.destroy()
  })
})
