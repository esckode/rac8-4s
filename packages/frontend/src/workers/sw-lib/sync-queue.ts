import type { ReplayOutcome } from './messages'
import { VENUE_TTL_MS } from './venue-cache'

const DB_NAME = 'pwa-sync'
const DB_VERSION = 1
const STORE_NAME = 'score-queue'
const SCORE_URL_RE = /^\/tournaments\/([^/]+)\/(?:matches|knockout)\/([^/]+)\/score$/

export interface QueuedScoreEntry {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body: string
  enqueuedAt: number
}

export interface ReplayNotification {
  outcome: ReplayOutcome
  tournamentId: string
  matchId: string
  detail?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// getAll() with no index returns records ordered by the primary key (a
// random UUID) — not insertion order — so FIFO relies entirely on sorting by
// enqueuedAt. Two enqueue() calls in the same millisecond would otherwise tie
// (Date.now() resolution) and fall back to that primary-key order. A tiny
// monotonic counter guarantees each call gets a strictly later timestamp.
let lastEnqueuedAt = 0

function nextEnqueuedAt(): number {
  const now = Date.now()
  lastEnqueuedAt = now > lastEnqueuedAt ? now : lastEnqueuedAt + 1
  return lastEnqueuedAt
}

/** Persists a queueable-score write for later replay (D7). */
export async function enqueue(
  entry: Pick<QueuedScoreEntry, 'url' | 'method' | 'headers' | 'body'>
): Promise<QueuedScoreEntry> {
  const fullEntry: QueuedScoreEntry = {
    id: crypto.randomUUID(),
    enqueuedAt: nextEnqueuedAt(),
    ...entry,
  }
  await withStore('readwrite', (store) => store.add(fullEntry))
  return fullEntry
}

/** All queued entries, FIFO by enqueuedAt. */
export async function getAll(): Promise<QueuedScoreEntry[]> {
  const entries = await withStore<QueuedScoreEntry[]>('readonly', (store) => store.getAll())
  return entries.slice().sort((a, b) => a.enqueuedAt - b.enqueuedAt)
}

async function removeEntry(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}

/** Empties the queue (used by the sign-out wipe, D5). */
export async function clear(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
}

/** Synthesized 202 the SW returns immediately when a score write is queued (D8). */
export function buildQueuedResponse(id: string): Response {
  return new Response(JSON.stringify({ code: 'QUEUED', id }), {
    status: 202,
    statusText: 'Accepted',
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseIds(url: string): { tournamentId: string; matchId: string } {
  const path = new URL(url, 'https://placeholder.local').pathname
  const match = SCORE_URL_RE.exec(path)
  return { tournamentId: match?.[1] ?? '', matchId: match?.[2] ?? '' }
}

async function extractDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { message?: unknown }
    return typeof body?.message === 'string' ? body.message : undefined
  } catch {
    return undefined
  }
}

let inFlight = false

/**
 * Replays queued score submissions in FIFO order (D8). A simple in-flight
 * flag prevents concurrent calls (SW startup + connectivity-regain + app
 * foreground can all fire close together) from double-sending.
 */
export async function replayAll(
  fetchImpl: typeof fetch,
  notify: (result: ReplayNotification) => void
): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const entries = await getAll()
    for (const entry of entries) {
      const ids = parseIds(entry.url)

      if (Date.now() - entry.enqueuedAt > VENUE_TTL_MS) {
        await removeEntry(entry.id)
        notify({ ...ids, outcome: 'expired' })
        continue
      }

      let response: Response
      try {
        response = await fetchImpl(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: entry.body,
        })
      } catch {
        // Still offline — keep this and every remaining entry, try again on
        // the next replay trigger.
        return
      }

      if (response.ok) {
        await removeEntry(entry.id)
        notify({ ...ids, outcome: 'success' })
        continue
      }

      if (response.status === 401) {
        // Keep queued; don't hammer this entry again this run.
        notify({ ...ids, outcome: 'needs-auth' })
        continue
      }

      if (response.status >= 400 && response.status < 500) {
        // Never blind-retry a 4xx (e.g. already scored) — drop it.
        const detail = await extractDetail(response)
        await removeEntry(entry.id)
        notify({ ...ids, outcome: 'rejected', detail })
        continue
      }

      // 5xx or anything else unexpected: a transient server issue, not a
      // definitive rejection — keep queued and stop this run rather than
      // silently destroying a real score.
      return
    }
  } finally {
    inFlight = false
  }
}
