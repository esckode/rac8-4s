/// <reference lib="webworker" />

const CACHE_NAME = 'tournament-v1'
const OFFLINE_URL = '/offline.html'
const DB_NAME = 'tournament-sync'
const QUEUE_STORE = 'sync-queue'

interface QueuedRequest {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timestamp: number
  retries: number
}

// Open IndexedDB for request queue persistence
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      }
    }
  })
}

// Queue a request for later sync
const queueRequest = async (req: QueuedRequest): Promise<void> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.add(req)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// Get all queued requests
const getQueuedRequests = async (): Promise<QueuedRequest[]> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, 'readonly')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as QueuedRequest[])
  })
}

// Remove a queued request
const removeQueuedRequest = async (id: string): Promise<void> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// Update retries for a queued request
const updateQueuedRequestRetries = async (
  id: string,
  retries: number
): Promise<void> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, 'readwrite')
    const store = transaction.objectStore(QUEUE_STORE)
    const getRequest = store.get(id)

    getRequest.onerror = () => reject(getRequest.error)
    getRequest.onsuccess = () => {
      const req = getRequest.result as QueuedRequest
      if (req) {
        req.retries = retries
        const updateRequest = store.put(req)
        updateRequest.onerror = () => reject(updateRequest.error)
        updateRequest.onsuccess = () => resolve()
      } else {
        resolve()
      }
    }
  })
}

// Send a queued request with exponential backoff
const sendQueuedRequest = async (
  req: QueuedRequest
): Promise<Response | null> => {
  const delays = [1000, 2000, 4000] // exponential backoff: 1s, 2s, 4s

  for (let attempt = 0; attempt <= req.retries; attempt++) {
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      })

      if (response.ok) {
        await removeQueuedRequest(req.id)
        return response
      } else if (attempt < req.retries) {
        // Retry on non-OK response
        const delay = delays[Math.min(attempt, delays.length - 1)]
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    } catch {
      // Network error - retry
      if (attempt < req.retries) {
        const delay = delays[Math.min(attempt, delays.length - 1)]
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        // Final attempt failed, keep in queue
        await updateQueuedRequestRetries(req.id, req.retries)
        return null
      }
    }
  }

  return null
}

// Sync all queued requests
const syncQueuedRequests = async (): Promise<void> => {
  try {
    const queued = await getQueuedRequests()
    for (const req of queued) {
      await sendQueuedRequest(req)
    }
  } catch (err) {
    // Log error but don't throw - sync event shouldn't fail
    console.error('[ServiceWorker] Sync failed:', err)
  }
}

// Install event - cache offline page
const swSelf = self as any
swSelf.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.add(OFFLINE_URL)
      })
      .then(() => swSelf.skipWaiting())
  )
})

// Activate event - claim clients
swSelf.addEventListener('activate', (event: any) => {
  event.waitUntil(swSelf.clients.claim())
})

// Fetch event - offline-first strategy
swSelf.addEventListener('fetch', (event: any) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests to API
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Update cache on successful response
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(async () => {
          // Queue POST/PUT/PATCH requests for later
          if (request.method !== 'GET') {
            const clonedRequest = request.clone()
            const headers: Record<string, string> = {}
            request.headers.forEach((value: string, key: string) => {
              headers[key] = value
            })

            const body = await clonedRequest.text()
            const queuedReq: QueuedRequest = {
              id: `${Date.now()}-${Math.random()}`,
              url: request.url,
              method: request.method,
              headers,
              body: body || undefined,
              timestamp: Date.now(),
              retries: 2, // max 3 attempts total
            }

            await queueRequest(queuedReq)

            // Return 202 Accepted indicating request is queued
            return new Response(
              JSON.stringify({ code: 'QUEUED', message: 'Request queued for sync' }),
              {
                status: 202,
                statusText: 'Accepted',
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }

          throw new Error('Network error')
        })
    )
    return
  }

  // GET requests - cache-first strategy
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Return cached response immediately if available
        if (cachedResponse) {
          // Update cache in background if online
          if (navigator.onLine) {
            fetch(request)
              .then((response) => {
                if (response.ok) {
                  const responseClone = response.clone()
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseClone)
                  })
                }
              })
              .catch(() => {
                // Silent failure for background update
              })
          }
          return cachedResponse
        }

        // No cache - try network
        return fetch(request)
          .then((response) => {
            // Cache successful response
            if (response.ok) {
              const responseClone = response.clone()
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone)
              })
            }
            return response
          })
          .catch(() => {
            // Return offline page if not cached
            return caches.match(OFFLINE_URL).then((offlineResponse) => {
              return (
                offlineResponse ||
                new Response('Offline', {
                  status: 503,
                  statusText: 'Service Unavailable',
                })
              )
            })
          })
      })
    )
    return
  }

  // Other methods - try network, fall back to offline page
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(OFFLINE_URL).then((response) => {
        return (
          response ||
          new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          })
        )
      })
    })
  )
})

// Background sync event
swSelf.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(syncQueuedRequests())
  }
})
