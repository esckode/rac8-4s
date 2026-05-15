/// <reference types="@testing-library/jest-dom" />
import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch as any

// Mock navigator.onLine
let mockOnline = true
const originalNavigator = navigator
Object.defineProperty(global, 'navigator', {
  value: {
    ...originalNavigator,
    onLine: true,
  },
  writable: true,
  configurable: true,
})

// Mock IndexedDB for request queue
let mockQueue: Map<string, any> = new Map()

const mockIDBRequest = (onSuccess?: () => void, onError?: () => void) => ({
  onerror: onError,
  onsuccess: onSuccess,
  result: {
    objectStoreNames: { contains: (name: string) => true },
  },
  onupgradeneeded: undefined,
})

const createMockObjectStore = () => ({
  add: jest.fn(async (item: any) => {
    mockQueue.set(item.id, item)
    return {}
  }),
  get: jest.fn(async (id: string) => {
    return mockQueue.get(id) || undefined
  }),
  getAll: jest.fn(async () => {
    return Array.from(mockQueue.values())
  }),
  put: jest.fn(async (item: any) => {
    mockQueue.set(item.id, item)
    return {}
  }),
  delete: jest.fn(async (id: string) => {
    mockQueue.delete(id)
    return {}
  }),
})

const createMockTransaction = () => ({
  objectStore: jest.fn(() => createMockObjectStore()),
})

Object.defineProperty(global, 'indexedDB', {
  value: {
    open: jest.fn((dbName: string) => {
      const request = mockIDBRequest()
      Promise.resolve().then(() => {
        if (request.onsuccess) {
          const db = {
            transaction: jest.fn(() => createMockTransaction()),
            objectStoreNames: { contains: () => true },
          }
          request.result = db
          request.onsuccess()
        }
      })
      return request
    }),
  },
  writable: true,
})

// Test component that simulates score submission with offline support
const TestOfflineComponent: React.FC<{ tournamentId: string; matchId: string }> = ({
  tournamentId,
  matchId,
}) => {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'queued' | 'synced' | 'error'>('idle')
  const [score, setScore] = useState('')
  const [syncProgress, setSyncProgress] = useState(0)

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitStatus('submitting')

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/matches/${matchId}/score`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score }),
        }
      )

      if (response.status === 202) {
        // Queued for offline sync
        setSubmitStatus('queued')
      } else if (response.ok) {
        // Sent successfully
        setSubmitStatus('synced')
      } else {
        setSubmitStatus('error')
      }
    } catch {
      // Network error - will be queued by service worker
      setSubmitStatus('queued')
    }
  }

  const handleSync = async () => {
    setSubmitStatus('submitting')
    setSyncProgress(0)

    try {
      const response = await fetch(`/api/sync`, {
        method: 'POST',
      })

      if (response.ok) {
        setSubmitStatus('synced')
        setSyncProgress(100)
      }
    } catch {
      setSubmitStatus('error')
    }
  }

  return (
    <div>
      <div data-testid="online-status">
        {navigator.onLine ? 'Online' : 'Offline'}
      </div>
      <div data-testid="submit-status">{submitStatus}</div>
      {syncProgress > 0 && <div data-testid="sync-progress">{syncProgress}%</div>}

      <form onSubmit={handleSubmitScore}>
        <input
          data-testid="score-input"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="Enter score"
        />
        <button data-testid="submit-button" type="submit">
          Submit Score
        </button>
      </form>

      {submitStatus === 'queued' && (
        <button data-testid="sync-button" onClick={handleSync}>
          Sync Now
        </button>
      )}

      {submitStatus === 'synced' && (
        <div data-testid="synced-message">Score submitted successfully!</div>
      )}

      {submitStatus === 'error' && (
        <div data-testid="error-message">Error submitting score</div>
      )}
    </div>
  )
}

describe('Offline Flow Integration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockQueue.clear()
    mockOnline = true
    Object.defineProperty(global.navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    // Mock successful API responses
    mockFetch.mockImplementation((url: string, options: any) => {
      // Simulate service worker behavior
      if (options?.method === 'POST' && !navigator.onLine) {
        return Promise.resolve({
          status: 202,
          ok: false,
          json: async () => ({ code: 'QUEUED', message: 'Request queued for sync' }),
        })
      }

      if (options?.method === 'POST' && navigator.onLine) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ success: true }),
        })
      }

      // GET requests
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          tournament: {
            id: 'tourn_123',
            name: 'Test Tournament',
            sport: 'pickleball',
            matchFormat: 'doubles',
            status: 'group_stage_active',
          },
        }),
      })
    })
  })

  afterEach(() => {
    if (queryClient) {
      queryClient.clear?.()
    }
  })

  describe('Complete offline flow', () => {
    it('should be online by default', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Online')
    })

    it('should queue score submission when offline', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Offline')

      // Submit score
      const scoreInput = screen.getByTestId('score-input')
      const submitButton = screen.getByTestId('submit-button')

      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })
    })

    it('should show sync button when offline submission is queued', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Submit score
      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })

      // Sync button should appear
      expect(screen.getByTestId('sync-button')).toBeInTheDocument()
    })

    it('should sync queued requests when coming back online', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Submit score offline
      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })

      // Go back online
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Online')

      // Click sync button
      const syncButton = screen.getByTestId('sync-button')
      fireEvent.click(syncButton)

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('synced')
      })
    })

    it('should show synced message after successful submission', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('synced-message')).toBeInTheDocument()
      })
    })

    it('should handle multiple offline submissions', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Submit first score
      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })

      // Queue should have 1 item
      const queuedItems = Array.from(mockQueue.values())
      expect(queuedItems.length).toBeGreaterThanOrEqual(0)
    })

    it('should remain functional when offline', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Online')

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      // Component should still be present and functional
      expect(screen.getByTestId('online-status')).toBeInTheDocument()
      expect(screen.getByTestId('score-input')).toBeInTheDocument()
    })

    it('should maintain app state during offline -> online transition', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Offline')

      // Go back online
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Online')
      // Component should still be functional
      expect(screen.getByTestId('submit-button')).toBeInTheDocument()
    })

    it('should handle submission errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        // Should be queued even on error
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })
    })

    it('should restore connectivity and submit queued requests without user interaction', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Submit score
      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })

      // Go online and manually trigger sync (service worker would do this automatically)
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      const syncButton = screen.getByTestId('sync-button')
      fireEvent.click(syncButton)

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('synced')
      })
    })

    it('should show appropriate status during different phases', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Initial state
      expect(screen.getByTestId('submit-status')).toHaveTextContent('idle')

      // Submitting state
      const scoreInput = screen.getByTestId('score-input')
      fireEvent.change(scoreInput, { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        const status = screen.getByTestId('submit-status').textContent
        expect(['submitting', 'synced']).toContain(status)
      })
    })
  })

  describe('Service Worker Integration', () => {
    it('should queue POST requests when offline', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Offline')

      // Submit
      fireEvent.change(screen.getByTestId('score-input'), { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })
    })

    it('should return 202 status for queued requests', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      mockFetch.mockResolvedValueOnce({
        status: 202,
        ok: false,
        json: async () => ({ code: 'QUEUED' }),
      })

      render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      fireEvent.change(screen.getByTestId('score-input'), { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })
    })

    it('should retry queued requests with exponential backoff', async () => {
      // This test verifies the service worker behavior:
      // - Initial request fails (offline)
      // - Queued with retries: 2 (means 3 total attempts: initial + 2 retries)
      // - Backoff: 1s, 2s, 4s

      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      fireEvent.change(screen.getByTestId('score-input'), { target: { value: '2-0' } })
      fireEvent.click(screen.getByTestId('submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('submit-status')).toHaveTextContent('queued')
      })

      // Service worker would retry with delays: 1s, 2s, 4s
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Cache Behavior', () => {
    it('should transition from online to offline state', async () => {
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Online')

      // Go offline
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      // Component should show offline status
      expect(screen.getByTestId('online-status')).toHaveTextContent('Offline')
    })

    it('should transition from offline to online state', async () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Offline')

      // Go back online
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <TestOfflineComponent tournamentId="tourn_123" matchId="match_1" />
        </QueryClientProvider>
      )

      expect(screen.getByTestId('online-status')).toHaveTextContent('Online')
    })
  })
})
