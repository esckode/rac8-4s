export const VENUE_CACHE_NAME = 'venue-data-v1'
export const VENUE_TTL_MS = 48 * 60 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 3500

type NetworkOutcome =
  | { kind: 'response'; response: Response }
  | { kind: 'error' }
  | { kind: 'timeout' }

async function stampResponse(response: Response): Promise<Response> {
  const body = await response.clone().text()
  const headers = new Headers(response.headers)
  headers.set('sw-cached-at', new Date().toISOString())
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isExpired(response: Response): boolean {
  const cachedAt = response.headers.get('sw-cached-at')
  if (!cachedAt) return true
  return Date.now() - new Date(cachedAt).getTime() > VENUE_TTL_MS
}

function noSnapshotResponse(): Response {
  return new Response(JSON.stringify({ code: 'OFFLINE_NO_SNAPSHOT' }), {
    status: 504,
    statusText: 'Gateway Timeout',
    headers: { 'Content-Type': 'application/json' },
  })
}

async function serveFallback(cache: Cache, request: Request): Promise<Response> {
  const cached = await cache.match(request)
  if (!cached) return noSnapshotResponse()

  if (isExpired(cached)) {
    await cache.delete(request)
    return noSnapshotResponse()
  }

  const headers = new Headers(cached.headers)
  headers.set('sw-cache', 'fallback')
  const body = await cached.clone().text()
  return new Response(body, { status: cached.status, statusText: cached.statusText, headers })
}

/**
 * Network-first read for the two venue-read endpoints (D3): try the network
 * with a timeout, cache fallback only on failure. Every network success
 * refreshes the cache entry, stamped with `sw-cached-at` — including a late
 * response that arrives after the timeout already served a fallback. Non-2xx
 * network responses are returned as-is and never cached (D3 only guards
 * against network failure, not application errors).
 */
export async function networkFirst(request: Request, opts: { timeoutMs?: number } = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const cache = await caches.open(VENUE_CACHE_NAME)

  const networkPromise: Promise<NetworkOutcome> = fetch(request).then(
    async (response): Promise<NetworkOutcome> => {
      if (response.ok) {
        await cache.put(request, await stampResponse(response.clone()))
      }
      return { kind: 'response', response }
    },
    (): NetworkOutcome => ({ kind: 'error' })
  )

  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise: Promise<NetworkOutcome> = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs)
  })

  const outcome = await Promise.race([networkPromise, timeoutPromise])
  clearTimeout(timeoutId!)

  if (outcome.kind === 'response') {
    return outcome.response
  }

  if (outcome.kind === 'timeout') {
    // Don't block the response on the late network result, but let it keep
    // refreshing the cache in the background; swallow so it never surfaces
    // as an unhandled rejection (it already resolved to {kind:'error'} above).
    networkPromise.catch(() => {})
  }

  return serveFallback(cache, request)
}

/** Removes only venue-cache entries older than VENUE_TTL_MS. Run on SW activate (D6). */
export async function pruneExpired(): Promise<void> {
  const cache = await caches.open(VENUE_CACHE_NAME)
  const requests = await cache.keys()
  await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request)
      if (response && isExpired(response)) {
        await cache.delete(request)
      }
    })
  )
}

/** Deletes the venue cache only — precache and any other cache are untouched (D5). */
export async function wipe(): Promise<void> {
  await caches.delete(VENUE_CACHE_NAME)
}
