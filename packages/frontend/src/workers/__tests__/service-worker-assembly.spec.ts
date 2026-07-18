/**
 * Thin assembly spec: with every sw-lib module and workbox-precaching mocked,
 * verifies service-worker.ts's exported handleFetch/handleMessage dispatch to
 * the right collaborator per §0.5/§0.6. The actual logic (routing rules,
 * caching, queueing) is exercised by its own sw-lib unit specs — this file
 * only checks the wiring.
 */

jest.mock('../sw-lib/routing', () => ({
  classifyRequest: jest.fn(),
}))
jest.mock('../sw-lib/venue-cache', () => ({
  networkFirst: jest.fn(),
  pruneExpired: jest.fn().mockResolvedValue(undefined),
  wipe: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../sw-lib/sync-queue', () => ({
  enqueue: jest.fn(),
  buildQueuedResponse: jest.fn(),
  replayAll: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('workbox-precaching', () => ({
  precacheAndRoute: jest.fn(),
  cleanupOutdatedCaches: jest.fn(),
  matchPrecache: jest.fn(),
}))

import { classifyRequest } from '../sw-lib/routing'
import { networkFirst } from '../sw-lib/venue-cache'
import { enqueue, buildQueuedResponse, replayAll, clear } from '../sw-lib/sync-queue'
import { matchPrecache } from 'workbox-precaching'

// jsdom has no Response global (verified) — these are opaque tokens the
// mocked collaborators return; only identity (toBe) is asserted on them, so
// a plain object stands in fine.
function fakeResponse(): Response {
  return {} as unknown as Response
}

function fakeFetchEvent(overrides: Partial<{ method: string; url: string }> = {}) {
  const request = {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? 'https://example.com/player/tournaments',
    mode: 'same-origin',
    clone: jest.fn().mockReturnThis(),
    headers: new Headers(),
    text: jest.fn().mockResolvedValue(''),
  }
  return { request, respondWith: jest.fn() }
}

describe('service-worker assembly', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(globalThis as any).self = globalThis
  })

  describe('handleFetch', () => {
    it('does not intercept sse requests', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('sse')
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent()

      handleFetch(event as any)

      expect(event.respondWith).not.toHaveBeenCalled()
    })

    it('does not intercept passthrough requests', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('passthrough')
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent()

      handleFetch(event as any)

      expect(event.respondWith).not.toHaveBeenCalled()
    })

    it('dispatches venue-read requests to venue-cache.networkFirst', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('venue-read')
      const cachedResponse = fakeResponse()
      ;(networkFirst as jest.Mock).mockResolvedValue(cachedResponse)
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent()

      handleFetch(event as any)

      expect(event.respondWith).toHaveBeenCalledTimes(1)
      await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(cachedResponse)
      expect(networkFirst).toHaveBeenCalledWith(event.request)
    })

    it('dispatches a queueable-score request to the network, returning the real response on success', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('queueable-score')
      const networkResponse = fakeResponse()
      ;(globalThis as any).fetch = jest.fn().mockResolvedValue(networkResponse)
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent({ method: 'POST', url: 'https://example.com/tournaments/t1/matches/m1/score' })

      handleFetch(event as any)

      expect(event.respondWith).toHaveBeenCalledTimes(1)
      await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(networkResponse)
      expect(enqueue).not.toHaveBeenCalled()
    })

    it('enqueues and returns the synthesized 202 when the network fetch rejects', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('queueable-score')
      ;(globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('offline'))
      ;(enqueue as jest.Mock).mockResolvedValue({ id: 'queued-1' })
      const queuedResponse = fakeResponse()
      ;(buildQueuedResponse as jest.Mock).mockReturnValue(queuedResponse)
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent({ method: 'POST', url: 'https://example.com/tournaments/t1/matches/m1/score' })

      handleFetch(event as any)

      expect(event.respondWith).toHaveBeenCalledTimes(1)
      await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(queuedResponse)
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ url: event.request.url, method: 'POST' })
      )
      expect(buildQueuedResponse).toHaveBeenCalledWith('queued-1')
    })

    it('serves the live network response for navigation requests when online (D10 — network-first)', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('navigation')
      const networkResponse = fakeResponse()
      ;(globalThis as any).fetch = jest.fn().mockResolvedValue(networkResponse)
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent({ url: 'https://example.com/tournament/t1/matches' })

      handleFetch(event as any)

      expect(event.respondWith).toHaveBeenCalledTimes(1)
      await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(networkResponse)
      expect(matchPrecache).not.toHaveBeenCalled()
    })

    it('falls back to the precached shell when the network fetch fails', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('navigation')
      ;(globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('offline'))
      const shellResponse = fakeResponse()
      ;(matchPrecache as jest.Mock).mockResolvedValue(shellResponse)
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent({ url: 'https://example.com/tournament/t1/matches' })

      handleFetch(event as any)

      expect(event.respondWith).toHaveBeenCalledTimes(1)
      await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(shellResponse)
      expect(matchPrecache).toHaveBeenCalledWith('index.html')
    })

    it('falls back to /offline.html when the network fetch fails and there is no precached shell', async () => {
      (classifyRequest as jest.Mock).mockReturnValue('navigation')
      ;(globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('offline'))
      ;(matchPrecache as jest.Mock).mockResolvedValue(undefined)
      const offlineResponse = fakeResponse()
      ;(globalThis as any).caches = { match: jest.fn().mockResolvedValue(offlineResponse) }
      const { handleFetch } = await import('../service-worker')
      const event = fakeFetchEvent({ url: 'https://example.com/tournament/t1/matches' })

      handleFetch(event as any)

      expect(event.respondWith).toHaveBeenCalledTimes(1)
      await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(offlineResponse)
      expect((globalThis as any).caches.match).toHaveBeenCalledWith('/offline.html')
    })
  })

  describe('handleMessage', () => {
    function fakeMessageEvent(data: unknown) {
      return { data, waitUntil: jest.fn(), source: { postMessage: jest.fn() } }
    }

    it('wipes the venue cache + queue and replies WIPE_DONE to the source client on WIPE_PLAYER_DATA', async () => {
      const { handleMessage } = await import('../service-worker')
      const event = fakeMessageEvent({ type: 'WIPE_PLAYER_DATA' })

      handleMessage(event as any)

      expect(event.waitUntil).toHaveBeenCalledTimes(1)
      await event.waitUntil.mock.calls[0][0]

      const { wipe } = await import('../sw-lib/venue-cache')
      expect(wipe).toHaveBeenCalled()
      expect(clear).toHaveBeenCalled()
      expect(event.source.postMessage).toHaveBeenCalledWith({ type: 'WIPE_DONE' })
    })

    it('replays the queue on REPLAY_QUEUE', async () => {
      const { handleMessage } = await import('../service-worker')
      const event = fakeMessageEvent({ type: 'REPLAY_QUEUE' })

      handleMessage(event as any)

      expect(event.waitUntil).toHaveBeenCalledTimes(1)
      await event.waitUntil.mock.calls[0][0]

      expect(replayAll).toHaveBeenCalled()
    })

    it('ignores malformed/unknown messages', async () => {
      const { handleMessage } = await import('../service-worker')
      const event = fakeMessageEvent({ type: 'BOGUS' })

      handleMessage(event as any)

      expect(event.waitUntil).not.toHaveBeenCalled()
    })
  })
})
