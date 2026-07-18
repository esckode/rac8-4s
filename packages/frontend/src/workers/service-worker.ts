/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching'
import { classifyRequest } from './sw-lib/routing'
import { networkFirst, pruneExpired, wipe } from './sw-lib/venue-cache'
import { enqueue, buildQueuedResponse, replayAll, clear as clearQueue } from './sw-lib/sync-queue'
import { isAppMessage, type SwMessage } from './sw-lib/messages'

declare const self: ServiceWorkerGlobalScope

// The Background Sync API isn't part of TypeScript's bundled webworker lib.
interface SyncEventLike extends ExtendableEvent {
  tag: string
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

async function handleQueueableScore(request: Request): Promise<Response> {
  try {
    return await fetch(request.clone())
  } catch {
    const entry = await enqueue({
      url: request.url,
      method: request.method,
      headers: headersToObject(request.headers),
      body: await request.clone().text(),
    })
    return buildQueuedResponse(entry.id)
  }
}

async function handleNavigation(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    const shell = await matchPrecache('index.html')
    if (shell) return shell
    const offline = await caches.match('/offline.html')
    return offline ?? new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}

/** Dispatches a fetch event per the §0.5 classification contract (routing.ts).
 * sse/passthrough are never intercepted — event.respondWith is simply not called. */
export function handleFetch(event: FetchEvent): void {
  const url = new URL(event.request.url)
  const requestClass = classifyRequest(event.request.method, url, event.request.mode)

  if (requestClass === 'venue-read') {
    event.respondWith(networkFirst(event.request))
  } else if (requestClass === 'queueable-score') {
    event.respondWith(handleQueueableScore(event.request))
  } else if (requestClass === 'navigation') {
    event.respondWith(handleNavigation(event.request))
  }
}

async function notifyAllClients(message: SwMessage): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  clients.forEach((client) => client.postMessage(message))
}

async function replayQueue(): Promise<void> {
  await replayAll(fetch, (result) => {
    void notifyAllClients({ type: 'REPLAY_RESULT', ...result })
  })
}

/** Dispatches an app→SW message per the §0.6 bridge contract (messages.ts). */
export function handleMessage(event: ExtendableMessageEvent): void {
  if (!isAppMessage(event.data)) return

  if (event.data.type === 'WIPE_PLAYER_DATA') {
    event.waitUntil(
      Promise.all([wipe(), clearQueue()]).then(() => {
        const source = event.source as Client | null
        source?.postMessage({ type: 'WIPE_DONE' } satisfies SwMessage)
      })
    )
    return
  }

  // REPLAY_QUEUE
  event.waitUntil(replayQueue())
}

self.addEventListener('fetch', handleFetch as EventListener)
self.addEventListener('message', handleMessage as EventListener)

// No skipWaiting()/clients.claim() here — D9: a new SW waits; the app prompts
// "Update available — Refresh" and applies it only on request.
self.addEventListener('install', () => {})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(pruneExpired())
})

// Chromium-only bonus (§2 — iOS Safari has no Background Sync); nothing depends on it.
self.addEventListener('sync', ((event: SyncEventLike) => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(replayQueue())
  }
}) as EventListener)

// Top-level replay trigger: SW (re)start attempts a replay immediately;
// replayAll no-ops quickly when the queue is empty.
replayQueue().catch(() => {})
