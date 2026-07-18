import { networkFirst, pruneExpired, wipe, VENUE_CACHE_NAME, VENUE_TTL_MS } from '../venue-cache'

// Minimal in-memory Cache Storage stub + Response/Request doubles — jsdom has
// neither `caches` nor `fetch`/`Response`/`Request` natively (verified: all
// undefined in this project's jest jsdom environment). Kept local to this spec
// per PWA_CACHING_IMPLEMENTATION.md §S2.1; `Headers` is a real jsdom global.

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
    return new MockResponse(this.bodyText, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
    })
  }

  async text(): Promise<string> {
    return this.bodyText
  }
}

class MockRequest {
  readonly url: string
  readonly method: string

  constructor(url: string, method = 'GET') {
    this.url = url
    this.method = method
  }

  clone(): MockRequest {
    return new MockRequest(this.url, this.method)
  }
}

class MockCache {
  private store = new Map<string, MockResponse>()

  async match(request: MockRequest): Promise<MockResponse | undefined> {
    return this.store.get(request.url)
  }

  async put(request: MockRequest, response: MockResponse): Promise<void> {
    this.store.set(request.url, response)
  }

  async delete(request: MockRequest): Promise<boolean> {
    return this.store.delete(request.url)
  }

  async keys(): Promise<MockRequest[]> {
    return Array.from(this.store.keys()).map((url) => new MockRequest(url))
  }
}

class MockCacheStorage {
  private stores = new Map<string, MockCache>()

  async open(name: string): Promise<MockCache> {
    if (!this.stores.has(name)) this.stores.set(name, new MockCache())
    return this.stores.get(name)!
  }

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name)
  }

  async keys(): Promise<string[]> {
    return Array.from(this.stores.keys())
  }
}

function install(): MockCacheStorage {
  const mockCaches = new MockCacheStorage()
  ;(globalThis as any).caches = mockCaches
  // jsdom has no Response/Request globals — the module under test constructs
  // real `new Response(...)`/`new Request(...)` instances, so stand them in.
  ;(globalThis as any).Response = MockResponse
  ;(globalThis as any).Request = MockRequest
  return mockCaches
}

function mockFetch(impl: jest.Mock) {
  (globalThis as any).fetch = impl
}

describe('venue-cache', () => {
  afterEach(() => {
    delete (globalThis as any).caches
    delete (globalThis as any).fetch
    delete (globalThis as any).Response
    delete (globalThis as any).Request
    jest.useRealTimers()
  })

  describe('networkFirst', () => {
    it('returns the network response and stores a stamped copy in the cache on success', async () => {
      const mockCaches = install()
      mockFetch(jest.fn().mockResolvedValue(new MockResponse(JSON.stringify({ ok: true }), { status: 200 })))

      const request = new MockRequest('https://example.com/player/tournaments')
      const result = await networkFirst(request as any)

      expect(await (result as any).text()).toBe(JSON.stringify({ ok: true }))

      const cache = await mockCaches.open(VENUE_CACHE_NAME)
      const cached = await cache.match(request)
      expect(cached).toBeDefined()
      expect(cached!.headers.get('sw-cached-at')).toBeTruthy()
    })

    it('serves the cached entry with sw-cache: fallback on network rejection', async () => {
      const mockCaches = install()
      const cache = await mockCaches.open(VENUE_CACHE_NAME)
      const request = new MockRequest('https://example.com/player/tournaments')
      await cache.put(
        request,
        new MockResponse(JSON.stringify({ cached: true }), {
          status: 200,
          headers: { 'sw-cached-at': new Date().toISOString() },
        })
      )
      mockFetch(jest.fn().mockRejectedValue(new Error('offline')))

      const result = await networkFirst(request as any)

      expect(result.headers.get('sw-cache')).toBe('fallback')
      expect(await (result as any).text()).toBe(JSON.stringify({ cached: true }))
    })

    it('serves the fallback when the network is slower than the timeout, and still refreshes the cache once the late response arrives', async () => {
      jest.useFakeTimers()
      const mockCaches = install()
      const cache = await mockCaches.open(VENUE_CACHE_NAME)
      const request = new MockRequest('https://example.com/player/tournaments')
      await cache.put(
        request,
        new MockResponse(JSON.stringify({ cached: true }), {
          status: 200,
          headers: { 'sw-cached-at': new Date(Date.now() - 1000).toISOString() },
        })
      )

      let resolveFetch!: (value: MockResponse) => void
      const pending = new Promise<MockResponse>((resolve) => {
        resolveFetch = resolve
      })
      mockFetch(jest.fn().mockReturnValue(pending))

      const resultPromise = networkFirst(request as any, { timeoutMs: 3500 })
      await jest.advanceTimersByTimeAsync(3500)
      const result = await resultPromise

      expect(result.headers.get('sw-cache')).toBe('fallback')
      expect(await (result as any).text()).toBe(JSON.stringify({ cached: true }))

      // Late network response arrives after the timeout already returned.
      resolveFetch(new MockResponse(JSON.stringify({ fresh: true }), { status: 200 }))
      await jest.advanceTimersByTimeAsync(0)

      const refreshed = await cache.match(request)
      expect(await refreshed!.text()).toBe(JSON.stringify({ fresh: true }))
    })

    it('treats an expired cache entry as a miss and returns OFFLINE_NO_SNAPSHOT on network failure', async () => {
      install()
      const cache = await (globalThis as any).caches.open(VENUE_CACHE_NAME)
      const request = new MockRequest('https://example.com/player/tournaments')
      await cache.put(
        request,
        new MockResponse('{}', {
          status: 200,
          headers: { 'sw-cached-at': new Date(Date.now() - VENUE_TTL_MS - 1000).toISOString() },
        })
      )
      mockFetch(jest.fn().mockRejectedValue(new Error('offline')))

      const result = await networkFirst(request as any)

      expect(result.status).toBe(504)
      const body = JSON.parse(await (result as any).text())
      expect(body.code).toBe('OFFLINE_NO_SNAPSHOT')
    })

    it('returns OFFLINE_NO_SNAPSHOT on network failure when nothing was ever cached', async () => {
      install()
      mockFetch(jest.fn().mockRejectedValue(new Error('offline')))
      const request = new MockRequest('https://example.com/player/tournaments')

      const result = await networkFirst(request as any)

      expect(result.status).toBe(504)
      const body = JSON.parse(await (result as any).text())
      expect(body.code).toBe('OFFLINE_NO_SNAPSHOT')
    })

    it('returns non-2xx network responses as-is without caching them', async () => {
      const mockCaches = install()
      const request = new MockRequest('https://example.com/player/tournaments')
      mockFetch(jest.fn().mockResolvedValue(new MockResponse('server error', { status: 500 })))

      const result = await networkFirst(request as any)

      expect(result.status).toBe(500)
      const cache = await mockCaches.open(VENUE_CACHE_NAME)
      expect(await cache.match(request)).toBeUndefined()
    })
  })

  describe('pruneExpired', () => {
    it('removes only entries older than the TTL', async () => {
      const mockCaches = install()
      const cache = await mockCaches.open(VENUE_CACHE_NAME)
      const freshReq = new MockRequest('https://example.com/player/tournaments')
      const staleReq = new MockRequest('https://example.com/tournaments/t1/bundle')
      await cache.put(
        freshReq,
        new MockResponse('{}', { status: 200, headers: { 'sw-cached-at': new Date().toISOString() } })
      )
      await cache.put(
        staleReq,
        new MockResponse('{}', {
          status: 200,
          headers: { 'sw-cached-at': new Date(Date.now() - VENUE_TTL_MS - 1000).toISOString() },
        })
      )

      await pruneExpired()

      expect(await cache.match(freshReq)).toBeDefined()
      expect(await cache.match(staleReq)).toBeUndefined()
    })

    it('treats an entry missing sw-cached-at as expired', async () => {
      const mockCaches = install()
      const cache = await mockCaches.open(VENUE_CACHE_NAME)
      const unstampedReq = new MockRequest('https://example.com/player/tournaments')
      await cache.put(unstampedReq, new MockResponse('{}', { status: 200 }))

      await pruneExpired()

      expect(await cache.match(unstampedReq)).toBeUndefined()
    })
  })

  describe('wipe', () => {
    it('deletes the venue cache and leaves other caches untouched', async () => {
      const mockCaches = install()
      await mockCaches.open(VENUE_CACHE_NAME)
      await mockCaches.open('workbox-precache-v1')

      await wipe()

      expect(await mockCaches.keys()).toEqual(['workbox-precache-v1'])
    })
  })
})
