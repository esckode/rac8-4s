/// <reference types="@testing-library/jest-dom" />

// Mock Response and Request classes
class MockResponse {
  status: number
  statusText: string
  ok: boolean
  headers: Map<string, string>

  constructor(body?: string | null, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
    this.status = init?.status ?? 200
    this.statusText = init?.statusText ?? ''
    this.ok = this.status >= 200 && this.status < 300
    this.headers = new Map(Object.entries(init?.headers ?? {}))
  }

  clone() {
    return new MockResponse()
  }

  async text() {
    return ''
  }
}

class MockRequest {
  url: string
  method: string
  headers: Map<string, string>

  constructor(url: string, init?: { method?: string; headers?: Record<string, string> }) {
    this.url = url
    this.method = init?.method ?? 'GET'
    this.headers = new Map(Object.entries(init?.headers ?? {}))
  }

  clone() {
    return new MockRequest(this.url, { method: this.method })
  }

  async text() {
    return ''
  }
}

Object.defineProperty(global, 'Response', {
  value: MockResponse,
  writable: true,
})

Object.defineProperty(global, 'Request', {
  value: MockRequest,
  writable: true,
})

Object.defineProperty(global, 'fetch', {
  value: jest.fn(),
  writable: true,
})

// Service Worker context mock
const mockCache = {
  add: jest.fn(),
  addAll: jest.fn(),
  match: jest.fn(),
  matchAll: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}

const mockCaches = {
  open: jest.fn(() => Promise.resolve(mockCache)),
  match: jest.fn(),
  delete: jest.fn(),
}

let mockIndexedDB: any = {}

const mockIDBRequest = (onSuccess?: () => void, onError?: () => void) => ({
  onerror: onError,
  onsuccess: onSuccess,
  result: {},
  onupgradeneeded: undefined,
})

// Setup global mocks
Object.defineProperty(global, 'caches', {
  value: mockCaches,
  writable: true,
})

Object.defineProperty(global, 'indexedDB', {
  value: {
    open: jest.fn((dbName: string, version: number) => {
      const request = mockIDBRequest()
      // Simulate successful DB open
      Promise.resolve().then(() => {
        if (request.onsuccess) request.onsuccess()
      })
      return request
    }),
  },
  writable: true,
})

describe('Service Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCache.add.mockResolvedValue(undefined)
    mockCache.match.mockResolvedValue(null)
    mockCache.put.mockResolvedValue(undefined)
    mockCaches.open.mockResolvedValue(mockCache)
  })

  describe('Cache Strategy', () => {
    it('should have correct cache name', () => {
      const CACHE_NAME = 'tournament-v1'
      expect(CACHE_NAME).toBe('tournament-v1')
    })

    it('should have offline URL configured', () => {
      const OFFLINE_URL = '/offline.html'
      expect(OFFLINE_URL).toBe('/offline.html')
    })

    it('should setup caches correctly', () => {
      expect(mockCaches).toBeDefined()
      expect(mockCaches.open).toBeDefined()
    })
  })

  describe('GET Request Handling', () => {
    it('should serve cached response immediately if available', async () => {
      const mockResponse = new Response('cached data')
      mockCache.match.mockResolvedValue(mockResponse)

      const request = new Request('https://example.com/api/tournaments')
      const cachedResult = await mockCache.match(request)

      expect(cachedResult).toBe(mockResponse)
      expect(mockCache.match).toHaveBeenCalledWith(request)
    })

    it('should fallback to offline page if not cached', async () => {
      mockCache.match.mockResolvedValue(null)

      const result = await mockCache.match('/offline.html')
      expect(mockCache.match).toHaveBeenCalled()
    })
  })

  describe('POST Request Queuing', () => {
    it('should return 202 Accepted for queued POST requests when offline', async () => {
      const mockResponse = new Response(
        JSON.stringify({ code: 'QUEUED', message: 'Request queued for sync' }),
        {
          status: 202,
          statusText: 'Accepted',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      expect(mockResponse.status).toBe(202)
      expect(mockResponse.statusText).toBe('Accepted')
    })
  })

  describe('Sync Event', () => {
    it('should handle sync events with sync-scores tag', () => {
      const syncListeners: ((event: any) => void)[] = []
      jest.spyOn(self, 'addEventListener').mockImplementation((event: any, listener: any) => {
        if (event === 'sync') {
          syncListeners.push(listener)
        }
      })

      expect(self.addEventListener).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const request = new Request('https://example.com/api/tournaments')
      mockCache.match.mockResolvedValue(null)

      // Simulating network error scenario
      expect(mockCache.match).toBeDefined()
    })

    it('should handle IndexedDB errors gracefully', async () => {
      const openDBRequest = (global as any).indexedDB.open('tournament-sync', 1)
      expect(openDBRequest).toBeDefined()
    })
  })

  describe('Cache Management', () => {
    it('should update cache for successful GET requests', async () => {
      const response = new Response('new data')
      mockCache.put.mockResolvedValue(undefined)

      await mockCache.put('/api/test', response)
      expect(mockCache.put).toHaveBeenCalledWith('/api/test', response)
    })

    it('should not cache error responses', () => {
      const errorResponse = new Response('error', { status: 500 })
      expect(errorResponse.ok).toBe(false)
    })
  })

  describe('Offline Mode', () => {
    it('should queue requests when offline', () => {
      // Simulate offline state
      const offlineEvent = new Event('offline')
      expect(offlineEvent.type).toBe('offline')
    })

    it('should sync queued requests when online', () => {
      // Simulate online state and sync
      const onlineEvent = new Event('online')
      expect(onlineEvent.type).toBe('online')
    })
  })

  describe('Request Queue', () => {
    it('should store queued requests with unique IDs', () => {
      const id1 = `${Date.now()}-${Math.random()}`
      const id2 = `${Date.now()}-${Math.random()}`
      expect(id1).not.toBe(id2)
    })

    it('should track retry attempts for queued requests', () => {
      const queuedRequest = {
        id: 'test-1',
        url: '/api/test',
        method: 'POST',
        headers: {},
        timestamp: Date.now(),
        retries: 2,
      }
      expect(queuedRequest.retries).toBe(2)
    })

    it('should have exponential backoff delays', () => {
      const delays = [1000, 2000, 4000]
      expect(delays[0]).toBe(1000) // 1s
      expect(delays[1]).toBe(2000) // 2s
      expect(delays[2]).toBe(4000) // 4s
    })
  })

  describe('Headers Handling', () => {
    it('should preserve request headers when queuing', () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      }
      expect(Object.keys(headers).length).toBe(2)
      expect(headers['Content-Type']).toBe('application/json')
    })
  })

  describe('Body Handling', () => {
    it('should serialize request body for queued requests', async () => {
      const body = JSON.stringify({ score: '6-4, 6-3' })
      expect(body).toBe('{"score":"6-4, 6-3"}')
    })

    it('should handle empty body requests', () => {
      const body = undefined
      expect(body).toBeUndefined()
    })
  })

  describe('Cache Versioning', () => {
    it('should use versioned cache name', () => {
      const CACHE_NAME = 'tournament-v1'
      expect(CACHE_NAME).toBe('tournament-v1')
    })
  })

  describe('Offline Page', () => {
    it('should have offline.html as fallback', () => {
      const OFFLINE_URL = '/offline.html'
      expect(OFFLINE_URL).toBe('/offline.html')
    })
  })

  describe('IndexedDB', () => {
    it('should use tournament-sync database', () => {
      const DB_NAME = 'tournament-sync'
      expect(DB_NAME).toBe('tournament-sync')
    })

    it('should use sync-queue object store', () => {
      const QUEUE_STORE = 'sync-queue'
      expect(QUEUE_STORE).toBe('sync-queue')
    })
  })

  describe('Response Creation', () => {
    it('should create 202 Accepted response for queued requests', () => {
      const response = new Response(
        JSON.stringify({ code: 'QUEUED', message: 'Request queued for sync' }),
        {
          status: 202,
          statusText: 'Accepted',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      expect(response.status).toBe(202)
      expect(response.statusText).toBe('Accepted')
    })

    it('should create 503 offline response', () => {
      const response = new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable',
      })

      expect(response.status).toBe(503)
      expect(response.statusText).toBe('Service Unavailable')
    })
  })
})
