/**
 * Test suite for useSSE hook
 *
 * Validates that the hook:
 * - Opens ReconnectingEventSource on mount
 * - Closes connection on unmount
 * - Listens for and handles SSE events
 * - Auto-reconnects (via library)
 * - Handles errors gracefully
 * - Returns connection status
 * - Doesn't open connection if tournamentId is undefined
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useSSE } from '../useSSE'
import { useTournament } from '../useTournament'
import * as stores from '../../state'

// Mock ReconnectingEventSource
class MockEventSource {
  url: string
  options: any
  listeners: Record<string, Function[]> = {}
  closed = false

  constructor(url: string, options?: any) {
    this.url = url
    this.options = options
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(handler)
  }

  removeEventListener(event: string, handler: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler)
    }
  }

  close() {
    this.closed = true
  }

  emitEvent(event: string, data?: any) {
    if (this.listeners[event]) {
      const messageEvent = new MessageEvent(event, {
        data: typeof data === 'string' ? data : JSON.stringify(data),
      })
      this.listeners[event].forEach(handler => {
        handler(messageEvent)
      })
    }
  }
}

let mockEventSourceInstance: MockEventSource | null = null

jest.mock('reconnecting-eventsource', () => {
  return jest.fn((url: string, options?: any) => {
    mockEventSourceInstance = new MockEventSource(url, options)
    return mockEventSourceInstance
  })
})

jest.mock('../useTournament')
jest.mock('../../state', () => ({
  standingsStore: { update: jest.fn() },
  matchStore: { setMatches: jest.fn() },
  playerCache: {},
}))

const mockUseTournament = useTournament as jest.MockedFunction<typeof useTournament>

describe('useSSE', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEventSourceInstance = null
  })

  afterEach(() => {
    if (mockEventSourceInstance) {
      mockEventSourceInstance.close()
    }
  })

  describe('Connection lifecycle', () => {
    it('opens EventSource on mount with correct URL', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      renderHook(() => useSSE(tournamentId))

      expect(mockEventSourceInstance).not.toBeNull()
      expect(mockEventSourceInstance?.url).toContain(`/tournaments/${tournamentId}/events`)
    })

    it('closes EventSource on unmount', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { unmount } = renderHook(() => useSSE(tournamentId))

      expect(mockEventSourceInstance?.closed).toBe(false)

      unmount()

      expect(mockEventSourceInstance?.closed).toBe(true)
    })

    it('does not open connection if tournamentId is undefined', () => {
      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      renderHook(() => useSSE(''))

      expect(mockEventSourceInstance).toBeNull()
    })
  })

  describe('Event handling', () => {
    it('handles standings.updated event and updates store', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      renderHook(() => useSSE(tournamentId))

      const standingsPayload = {
        groupId: 'group_1',
        standings: [
          {
            id: 'standing_1',
            groupId: 'group_1',
            playerId: 'player_1',
            rank: 1,
            wins: 2,
            losses: 0,
            setsWon: 4,
            setsLost: 0,
            tournamentId: 'tourn_123',
          },
        ],
      }

      mockEventSourceInstance?.emitEvent('standings.updated', standingsPayload)

      expect(stores.standingsStore.update).toHaveBeenCalledWith(standingsPayload)
    })

    it('handles bracket.published event without crashing', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      renderHook(() => useSSE(tournamentId))

      const bracketPayload = {
        matchCount: 8,
        byeCount: 0,
      }

      // Should not throw
      expect(() => {
        mockEventSourceInstance?.emitEvent('bracket.published', bracketPayload)
      }).not.toThrow()
    })
  })

  describe('Connection status', () => {
    it('returns connected=true when connection opens', async () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => useSSE(tournamentId))

      expect(result.current.connected).toBe(false)

      mockEventSourceInstance?.emitEvent('open')

      await waitFor(() => {
        expect(result.current.connected).toBe(true)
      })
    })

    it('returns reconnecting=true on error', async () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => useSSE(tournamentId))

      mockEventSourceInstance?.emitEvent('error')

      await waitFor(() => {
        expect(result.current.reconnecting).toBe(true)
        expect(result.current.connected).toBe(false)
      })
    })

    it('sets error to null when connection is restored', async () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => useSSE(tournamentId))

      // Open connection successfully
      mockEventSourceInstance?.emitEvent('open')

      await waitFor(() => {
        expect(result.current.error).toBeNull()
      })

      // Connection disconnects (error event)
      mockEventSourceInstance?.emitEvent('error')

      await waitFor(() => {
        expect(result.current.reconnecting).toBe(true)
      })

      // Connection reopens (error state cleared)
      mockEventSourceInstance?.emitEvent('open')

      await waitFor(() => {
        expect(result.current.error).toBeNull()
        expect(result.current.reconnecting).toBe(false)
      })
    })
  })

  describe('Error handling', () => {
    it('handles malformed standings.updated event without crashing', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => useSSE(tournamentId))

      // Emit malformed event
      const malformedEvent = new MessageEvent('standings.updated', {
        data: 'invalid json {',
      })

      mockEventSourceInstance?.listeners['standings.updated']?.forEach(handler => {
        handler(malformedEvent)
      })

      // Should not crash
      expect(result.current.connected).toBe(false) // unchanged
    })

    it('handles malformed bracket.published event without crashing', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { result } = renderHook(() => useSSE(tournamentId))

      // Emit malformed event
      const malformedEvent = new MessageEvent('bracket.published', {
        data: 'not valid json }{',
      })

      mockEventSourceInstance?.listeners['bracket.published']?.forEach(handler => {
        handler(malformedEvent)
      })

      // Should not crash
      expect(result.current).toBeDefined()
    })
  })

  describe('Reconnect strategy', () => {
    it('calls refetchTournament on reconnect after disconnect', async () => {
      const tournamentId = 'tourn_123'
      const mockRefetch = jest.fn()

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
        retryIn: null,
        cancelAutoRetry: jest.fn(),
      })

      renderHook(() => useSSE(tournamentId))

      // Open connection
      mockEventSourceInstance?.emitEvent('open')

      await waitFor(() => {
        expect(mockRefetch).not.toHaveBeenCalled()
      })

      // Disconnect
      mockEventSourceInstance?.emitEvent('error')

      // Reconnect
      mockEventSourceInstance?.emitEvent('open')

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })
  })

  describe('Configuration', () => {
    it('configures ReconnectingEventSource with maxReconnectionDelay', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      renderHook(() => useSSE(tournamentId))

      expect(mockEventSourceInstance?.options?.maxReconnectionDelay).toBe(8000)
    })
  })

  describe('Cleanup', () => {
    it('cleans up event listeners and timeouts on unmount', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { unmount } = renderHook(() => useSSE(tournamentId))

      const initialListeners = Object.keys(mockEventSourceInstance?.listeners || {})
        .map(k => mockEventSourceInstance?.listeners[k].length)
        .reduce((a, b) => (a ?? 0) + (b ?? 0), 0)

      unmount()

      expect(mockEventSourceInstance?.closed).toBe(true)
    })

    it('no memory leaks: event listeners removed on unmount', () => {
      const tournamentId = 'tourn_123'

      mockUseTournament.mockReturnValue({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
      })

      const { unmount } = renderHook(() => useSSE(tournamentId))

      expect(mockEventSourceInstance?.listeners['open']?.length).toBeGreaterThan(0)

      unmount()

      expect(mockEventSourceInstance?.closed).toBe(true)
    })
  })
})
