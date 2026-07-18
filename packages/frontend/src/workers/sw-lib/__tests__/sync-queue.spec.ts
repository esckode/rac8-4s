import 'fake-indexeddb/auto'
import { randomUUID } from 'crypto'
import { enqueue, getAll, buildQueuedResponse, replayAll, clear } from '../sync-queue'
import { VENUE_TTL_MS } from '../venue-cache'

// jsdom's `crypto` has no randomUUID, and this jest jsdom environment has no
// `structuredClone` at all (verified) — fake-indexeddb needs the latter
// internally for its structured-clone algorithm.
;(globalThis as any).crypto.randomUUID = randomUUID
;(globalThis as any).structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))

// jsdom has no Response global (verified) — a minimal double matching the
// real constructor shape, covering what buildQueuedResponse() and
// replayAll's extractDetail() need (status/ok/clone/json).
class MockResponse {
  readonly status: number
  readonly statusText: string
  readonly ok: boolean
  readonly headers: Headers
  private readonly bodyText: string

  constructor(body = '', init: { status?: number; statusText?: string; headers?: HeadersInit } = {}) {
    this.bodyText = body
    this.status = init.status ?? 200
    this.statusText = init.statusText ?? ''
    this.ok = this.status >= 200 && this.status < 300
    this.headers = new Headers(init.headers)
  }

  clone(): MockResponse {
    return new MockResponse(this.bodyText, { status: this.status, statusText: this.statusText, headers: this.headers })
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText)
  }
}
(globalThis as any).Response = MockResponse

function mockResponse(status: number, body: unknown = {}): Response {
  return new MockResponse(JSON.stringify(body), { status }) as unknown as Response
}

const SCORE_URL = 'https://example.com/tournaments/t1/matches/m1/score'
const KNOCKOUT_SCORE_URL = 'https://example.com/tournaments/t1/knockout/k1/score'

async function enqueueEntry(url = SCORE_URL) {
  return enqueue({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: JSON.stringify({ score: '11-9, 11-7' }),
  })
}

describe('sync-queue', () => {
  afterEach(async () => {
    await clear()
  })

  describe('enqueue / getAll', () => {
    it('persists the full entry shape and assigns an id + enqueuedAt', async () => {
      const entry = await enqueueEntry()

      expect(entry.id).toBeTruthy()
      expect(entry.url).toBe(SCORE_URL)
      expect(entry.method).toBe('POST')
      expect(entry.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' })
      expect(entry.body).toBe(JSON.stringify({ score: '11-9, 11-7' }))
      expect(typeof entry.enqueuedAt).toBe('number')
    })

    it('returns entries FIFO by enqueuedAt', async () => {
      const first = await enqueueEntry(SCORE_URL)
      const second = await enqueueEntry(KNOCKOUT_SCORE_URL)

      const all = await getAll()

      expect(all.map((e) => e.id)).toEqual([first.id, second.id])
    })
  })

  describe('buildQueuedResponse', () => {
    it('returns a 202 with code QUEUED and the entry id', async () => {
      const response = buildQueuedResponse('abc-123')

      expect(response.status).toBe(202)
      const body = await response.json()
      expect(body).toEqual({ code: 'QUEUED', id: 'abc-123' })
    })
  })

  describe('replayAll', () => {
    it('falls back to empty ids when the queued URL does not match the score pattern', async () => {
      await enqueue({
        url: 'https://example.com/tournaments/t1/advance',
        method: 'POST',
        headers: {},
        body: '{}',
      })
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockResolvedValue(mockResponse(200))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(notify).toHaveBeenCalledWith({ outcome: 'success', tournamentId: '', matchId: '' })
    })

    it('removes the entry and notifies success on a 2xx response', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockResolvedValue(mockResponse(200))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(await getAll()).toEqual([])
      expect(notify).toHaveBeenCalledWith({
        outcome: 'success',
        tournamentId: 't1',
        matchId: 'm1',
      })
    })

    it('keeps the entry and notifies needs-auth on a 401', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockResolvedValue(mockResponse(401))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(await getAll()).toHaveLength(1)
      expect(notify).toHaveBeenCalledWith({
        outcome: 'needs-auth',
        tournamentId: 't1',
        matchId: 'm1',
      })
    })

    it('removes the entry and notifies rejected (with detail) on a 409', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockResolvedValue(mockResponse(409, { message: 'already recorded' }))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(await getAll()).toEqual([])
      expect(notify).toHaveBeenCalledWith({
        outcome: 'rejected',
        tournamentId: 't1',
        matchId: 'm1',
        detail: 'already recorded',
      })
    })

    it('removes the entry and notifies rejected with no detail when the body has no message', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockResolvedValue(mockResponse(409, { code: 'ALREADY_SCORED' }))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(notify).toHaveBeenCalledWith({
        outcome: 'rejected',
        tournamentId: 't1',
        matchId: 'm1',
        detail: undefined,
      })
    })

    it('removes the entry and notifies rejected with no detail when the body is not JSON', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      const unparsable = {
        status: 409,
        ok: false,
        clone() {
          return this
        },
        async json() {
          throw new Error('not json')
        },
      }
      const fetchImpl = jest.fn().mockResolvedValue(unparsable as unknown as Response)

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(notify).toHaveBeenCalledWith({
        outcome: 'rejected',
        tournamentId: 't1',
        matchId: 'm1',
        detail: undefined,
      })
    })

    it('keeps the entry, does not notify, and aborts remaining entries on a network rejection', async () => {
      const first = await enqueueEntry(SCORE_URL)
      await enqueueEntry(KNOCKOUT_SCORE_URL)
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(notify).not.toHaveBeenCalled()
      const remaining = await getAll()
      expect(remaining.map((e) => e.id)).toEqual(expect.arrayContaining([first.id]))
      expect(remaining).toHaveLength(2)
    })

    it('keeps the entry and stops (does not drop) on a 5xx — transient, not a rejection', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockResolvedValue(mockResponse(500))

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(notify).not.toHaveBeenCalled()
      expect(await getAll()).toHaveLength(1)
    })

    it('drops an entry older than 48h without sending, and notifies expired', async () => {
      await enqueue({
        url: SCORE_URL,
        method: 'POST',
        headers: {},
        body: '{}',
      })
      // Directly age the stored entry past the TTL.
      const [entry] = await getAll()
      await clear()
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('pwa-sync', 1)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('score-queue', 'readwrite')
        tx.objectStore('score-queue').add({ ...entry, enqueuedAt: Date.now() - VENUE_TTL_MS - 1000 })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      const notify = jest.fn()
      const fetchImpl = jest.fn()

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(fetchImpl).not.toHaveBeenCalled()
      expect(await getAll()).toEqual([])
      expect(notify).toHaveBeenCalledWith({ outcome: 'expired', tournamentId: 't1', matchId: 'm1' })
    })

    it('preserves FIFO processing order', async () => {
      await enqueueEntry(SCORE_URL)
      await enqueueEntry(KNOCKOUT_SCORE_URL)
      const processedOrder: string[] = []
      const notify = jest.fn()
      const fetchImpl = jest.fn().mockImplementation(async (url: string) => {
        processedOrder.push(url)
        return mockResponse(200)
      })

      await replayAll(fetchImpl as unknown as typeof fetch, notify)

      expect(processedOrder).toEqual([SCORE_URL, KNOCKOUT_SCORE_URL])
    })

    it('does not double-send when called concurrently (in-flight guard)', async () => {
      await enqueueEntry()
      const notify = jest.fn()
      let resolveFetch!: (value: Response) => void
      const pending = new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
      const fetchImpl = jest.fn().mockReturnValue(pending)

      const run1 = replayAll(fetchImpl as unknown as typeof fetch, notify)
      const run2 = replayAll(fetchImpl as unknown as typeof fetch, notify)

      resolveFetch(mockResponse(200))
      await Promise.all([run1, run2])

      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear', () => {
    it('empties the store', async () => {
      await enqueueEntry()
      await clear()

      expect(await getAll()).toEqual([])
    })
  })
})
