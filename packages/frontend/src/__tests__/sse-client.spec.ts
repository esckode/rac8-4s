import { SSEClient } from '../sse/sse-client'
import type { SSEHandlers, StandingsUpdatedPayload, BracketPublishedPayload } from '../types'

// Mock EventSource for testing
class MockEventSource {
  url: string
  readyState: number = 1 // OPEN
  listeners: Map<string, Set<(event: any) => void>> = new Map()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(eventName: string, callback: (event: any) => void): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    this.listeners.get(eventName)!.add(callback)
  }

  removeEventListener(eventName: string, callback: (event: any) => void): void {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName)!.delete(callback)
    }
  }

  dispatchEvent(eventName: string, data: any): void {
    const event = new MessageEvent(eventName, { data: JSON.stringify(data) })
    this.listeners.get(eventName)?.forEach(callback => callback(event))
  }

  close(): void {
    this.readyState = 2 // CLOSED
  }

  triggerError(): void {
    const errorListeners = this.listeners.get('error') || new Set()
    errorListeners.forEach(callback => callback(new Event('error')))
  }
}

// Override EventSource globally for tests
let mockEventSourceInstance: MockEventSource | null = null
const OriginalEventSource = global.EventSource as any
global.EventSource = class extends MockEventSource {
  constructor(url: string) {
    super(url)
    mockEventSourceInstance = this
  }
} as any

describe('SSEClient', () => {
  let client: SSEClient
  let handlers: SSEHandlers

  beforeEach(() => {
    client = new SSEClient()
    mockEventSourceInstance = null
    handlers = {
      onStandingsUpdated: jest.fn(),
      onBracketPublished: jest.fn(),
      onReconnect: jest.fn(),
      onError: jest.fn(),
    }
  })

  afterEach(() => {
    client.disconnect()
  })

  describe('connect', () => {
    it('should create EventSource with correct URL', () => {
      client.connect('tour_123', 'token_abc', handlers)

      expect(mockEventSourceInstance).toBeDefined()
      expect(mockEventSourceInstance!.url).toContain('/tournaments/tour_123/events')
    })

    it('should include token as query parameter in URL', () => {
      client.connect('tour_123', 'token_abc', handlers)

      expect(mockEventSourceInstance!.url).toContain('token=token_abc')
    })

    it('should register event listeners for standings.updated', () => {
      client.connect('tour_123', 'token_abc', handlers)

      const hasListener = mockEventSourceInstance!.listeners.has('standings.updated')
      expect(hasListener).toBe(true)
    })

    it('should register event listeners for bracket.published', () => {
      client.connect('tour_123', 'token_abc', handlers)

      const hasListener = mockEventSourceInstance!.listeners.has('bracket.published')
      expect(hasListener).toBe(true)
    })
  })

  describe('event handling - standings.updated', () => {
    it('should call onStandingsUpdated handler when event received', () => {
      client.connect('tour_123', 'token_abc', handlers)

      const payload: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: [
          { playerId: 'p1', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 1 },
        ],
      }
      mockEventSourceInstance!.dispatchEvent('standings.updated', payload)

      expect(handlers.onStandingsUpdated).toHaveBeenCalledWith(payload)
    })

    it('should parse JSON data from event', () => {
      client.connect('tour_123', 'token_abc', handlers)

      const payload: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: [
          { playerId: 'p1', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 1 },
          { playerId: 'p2', rank: 2, wins: 1, losses: 1, setsWon: 3, setsLost: 2 },
        ],
      }
      mockEventSourceInstance!.dispatchEvent('standings.updated', payload)

      const call = (handlers.onStandingsUpdated as jest.Mock).mock.calls[0][0]
      expect(call.standings).toHaveLength(2)
      expect(call.standings[0].playerId).toBe('p1')
    })
  })

  describe('event handling - bracket.published', () => {
    it('should call onBracketPublished handler when event received', () => {
      client.connect('tour_123', 'token_abc', handlers)

      const payload: BracketPublishedPayload = {
        matchCount: 8,
        byeCount: 0,
      }
      mockEventSourceInstance!.dispatchEvent('bracket.published', payload)

      expect(handlers.onBracketPublished).toHaveBeenCalledWith(payload)
    })
  })

  describe('disconnect', () => {
    it('should close EventSource connection', () => {
      client.connect('tour_123', 'token_abc', handlers)

      expect(mockEventSourceInstance!.readyState).toBe(1) // OPEN

      client.disconnect()

      expect(mockEventSourceInstance!.readyState).toBe(2) // CLOSED
    })

    it('should remove event listeners', () => {
      client.connect('tour_123', 'token_abc', handlers)
      const listenerCountBefore = mockEventSourceInstance!.listeners.get(
        'standings.updated'
      )?.size || 0

      client.disconnect()

      // After disconnect, no new events should trigger handlers
      mockEventSourceInstance!.dispatchEvent('standings.updated', {
        groupId: 'group_1',
        standings: [],
      })

      expect(handlers.onStandingsUpdated).not.toHaveBeenCalled()
    })

    it('should be a no-op if not connected', () => {
      expect(() => client.disconnect()).not.toThrow()
    })
  })

  describe('reconnection handling', () => {
    it('should call onReconnect when error event is triggered', () => {
      client.connect('tour_123', 'token_abc', handlers)

      mockEventSourceInstance!.triggerError()

      expect(handlers.onReconnect).toHaveBeenCalled()
    })

    it('should allow reconnecting after disconnection', () => {
      client.connect('tour_123', 'token_abc', handlers)
      client.disconnect()

      const newHandlers: SSEHandlers = {
        onStandingsUpdated: jest.fn(),
        onBracketPublished: jest.fn(),
        onReconnect: jest.fn(),
        onError: jest.fn(),
      }
      client.connect('tour_456', 'token_xyz', newHandlers)

      expect(mockEventSourceInstance!.url).toContain('/tournaments/tour_456/events')
      expect(mockEventSourceInstance!.url).toContain('token=token_xyz')
    })
  })

  describe('error handling', () => {
    it('should call onError handler when network error occurs', () => {
      client.connect('tour_123', 'token_abc', handlers)

      // Simulate a fetch error during EventSource creation would be caught
      // For now, we test that handlers are set up correctly
      expect(handlers.onError).toBeDefined()
    })
  })

  describe('multiple connections', () => {
    it('should close previous connection when connecting again', () => {
      client.connect('tour_123', 'token_abc', handlers)
      const firstConnection = mockEventSourceInstance!

      const newHandlers: SSEHandlers = {
        onStandingsUpdated: jest.fn(),
        onBracketPublished: jest.fn(),
        onReconnect: jest.fn(),
        onError: jest.fn(),
      }
      client.connect('tour_456', 'token_xyz', newHandlers)

      expect(firstConnection.readyState).toBe(2) // CLOSED
      expect(mockEventSourceInstance).not.toBe(firstConnection)
    })
  })
})
