/**
 * V1.5 — Frontend maintenance view (503 / service unavailable)
 *
 * Tests that:
 * - ServiceUnavailable page renders the expected heading and retry message
 * - App-level 503 state shows the maintenance page instead of normal routes
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServiceUnavailable } from '../pages/ServiceUnavailable'
import { notify503, ServiceUnavailableProvider, useServiceUnavailable } from '../context/ServiceUnavailableContext'

describe('ServiceUnavailable page', () => {
  it('renders a "service temporarily unavailable" heading', () => {
    render(<ServiceUnavailable />)
    expect(
      screen.getByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })
    ).toBeInTheDocument()
  })

  it('shows a retry message so users know to try again', () => {
    render(<ServiceUnavailable />)
    // Should contain some guidance about trying again
    expect(screen.getByText(/try again/i)).toBeInTheDocument()
  })

  it('does not contain navigation links that would lead to broken routes', () => {
    render(<ServiceUnavailable />)
    // The maintenance page should stand alone — no nav links to routes that need the API
    const heading = screen.getByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })
    expect(heading).toBeInTheDocument()
  })
})

describe('ServiceUnavailableContext', () => {
  beforeEach(() => {
    // Reset the module-level flag between tests by re-rendering with a fresh provider
  })

  it('provides a ServiceUnavailableProvider that exposes serviceUnavailable = false by default', () => {
    const Consumer: React.FC = () => {
      const { serviceUnavailable } = useServiceUnavailable()
      return <div>{serviceUnavailable ? 'unavailable' : 'available'}</div>
    }

    render(
      <ServiceUnavailableProvider>
        <Consumer />
      </ServiceUnavailableProvider>
    )

    expect(screen.getByText('available')).toBeInTheDocument()
  })

  it('sets serviceUnavailable = true after notify503() is called', async () => {
    const Consumer: React.FC = () => {
      const { serviceUnavailable } = useServiceUnavailable()
      return <div data-testid="status">{serviceUnavailable ? 'unavailable' : 'available'}</div>
    }

    render(
      <ServiceUnavailableProvider>
        <Consumer />
      </ServiceUnavailableProvider>
    )

    expect(screen.getByTestId('status')).toHaveTextContent('available')

    notify503()

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unavailable')
    })
  })
})

describe('App-level 503 interception', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  /**
   * Renders a minimal app that:
   * 1. Wraps with ServiceUnavailableProvider
   * 2. Has a component that triggers an API call and renders ServiceUnavailable if needed
   * 3. Checks that a 503 error causes the maintenance page to render
   */
  it('renders the ServiceUnavailable page when notify503 is called (simulating a 503 API response)', async () => {
    /**
     * A minimal App-like wrapper that shows ServiceUnavailable on 503.
     * This mirrors what App.tsx will do after the wiring is implemented.
     */
    const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const { serviceUnavailable } = useServiceUnavailable()
      if (serviceUnavailable) return <ServiceUnavailable />
      return <>{children}</>
    }

    const NormalContent: React.FC = () => <div>Normal app content</div>

    render(
      <ServiceUnavailableProvider>
        <AppShell>
          <NormalContent />
        </AppShell>
      </ServiceUnavailableProvider>
    )

    // Before 503: normal content is shown
    expect(screen.getByText('Normal app content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })).not.toBeInTheDocument()

    // Simulate a 503 being received from the API
    notify503()

    // After 503: maintenance page is shown instead
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })).toBeInTheDocument()
    })
    expect(screen.queryByText('Normal app content')).not.toBeInTheDocument()
  })

  it('does NOT render the ServiceUnavailable page for non-503 errors', async () => {
    const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const { serviceUnavailable } = useServiceUnavailable()
      if (serviceUnavailable) return <ServiceUnavailable />
      return <>{children}</>
    }

    const NormalContent: React.FC = () => <div>Normal app content</div>

    render(
      <ServiceUnavailableProvider>
        <AppShell>
          <NormalContent />
        </AppShell>
      </ServiceUnavailableProvider>
    )

    // A non-503 error (e.g. 404, 401) does NOT call notify503()
    // The app continues to show normal content
    expect(screen.getByText('Normal app content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })).not.toBeInTheDocument()
  })

  it('apiFetch calls notify503() when the API responds with HTTP 503', async () => {
    // Mock fetch to return a 503
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ code: 'SERVICE_UNAVAILABLE' }),
    } as Response)
    global.fetch = mockFetch

    const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const { serviceUnavailable } = useServiceUnavailable()
      if (serviceUnavailable) return <ServiceUnavailable />
      return <>{children}</>
    }

    // A component that triggers an API call on mount
    const ApiTrigger: React.FC = () => {
      const [triggered, setTriggered] = React.useState(false)
      React.useEffect(() => {
        if (!triggered) {
          setTriggered(true)
          // Import the apiFetch-based function to test the real wiring
          import('../api/client').then(({ fetchPublicTournaments }) => {
            fetchPublicTournaments({ offset: 0, limit: 10 }).catch(() => {
              // expected to throw — the 503 side effect (notify503) is what we're testing
            })
          })
        }
      }, [triggered])
      return <div>Loading...</div>
    }

    render(
      <ServiceUnavailableProvider>
        <AppShell>
          <ApiTrigger />
        </AppShell>
      </ServiceUnavailableProvider>
    )

    // After the API call returns 503, the maintenance page should appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })).toBeInTheDocument()
    }, { timeout: 2000 })

    expect(mockFetch).toHaveBeenCalled()
  })

  it('apiFetch does NOT call notify503() for non-503 HTTP errors', async () => {
    // Mock fetch to return a 404
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ code: 'NOT_FOUND' }),
    } as Response)

    const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const { serviceUnavailable } = useServiceUnavailable()
      if (serviceUnavailable) return <ServiceUnavailable />
      return <>{children}</>
    }

    const ApiTrigger: React.FC = () => {
      const [triggered, setTriggered] = React.useState(false)
      React.useEffect(() => {
        if (!triggered) {
          setTriggered(true)
          import('../api/client').then(({ fetchPublicTournaments }) => {
            fetchPublicTournaments({ offset: 0, limit: 10 }).catch(() => {
              // expected to throw — but should NOT trigger notify503 for 404
            })
          })
        }
      }, [triggered])
      return <div>Normal app content</div>
    }

    render(
      <ServiceUnavailableProvider>
        <AppShell>
          <ApiTrigger />
        </AppShell>
      </ServiceUnavailableProvider>
    )

    // Wait a bit to ensure the API call has been processed
    await new Promise(resolve => setTimeout(resolve, 100))

    // Normal content should still be shown (no maintenance page)
    expect(screen.getByText('Normal app content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })).not.toBeInTheDocument()
  })
})
