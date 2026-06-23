/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TournamentDetail } from '../index'

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch as any

// Mock ReconnectingEventSource
jest.mock('reconnecting-eventsource', () => {
  return jest.fn(() => ({
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    close: jest.fn(),
  }))
})

jest.mock('../../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../../hooks/usePermissions', () => ({
  usePermissions: jest.fn(),
}))

jest.mock('../../../hooks/useAnalytics', () => ({
  useAnalytics: jest.fn(),
}))

jest.mock('../../../hooks/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    unreadCount: 0,
    send: jest.fn(),
    markRead: jest.fn(),
  }),
}))

jest.mock('../../../state', () => ({
  tournamentStore: { set: jest.fn() },
  standingsStore: { update: jest.fn() },
  matchStore: { setMatches: jest.fn() },
  messageStore: { all: jest.fn(() => []), subscribe: jest.fn(() => jest.fn()), setHistory: jest.fn(), append: jest.fn(), markRead: jest.fn(), clear: jest.fn() },
}))

import { useAuth } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { useAnalytics } from '../../../hooks/useAnalytics'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>
const mockUseAnalytics = useAnalytics as jest.MockedFunction<typeof useAnalytics>

describe('TournamentDetail', () => {
  let queryClient: QueryClient

  const renderWithRouter = (component: React.ReactElement) => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/tournament/:tournamentId/*" element={component} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tournament: {
          id: 'tournament-1',
          name: 'Test Tournament',
          creatorId: 'org_789',
          sport: 'pickleball',
          matchFormat: 'doubles' as const,
          maxPlayers: 16,
          status: 'group_stage_active' as const,
          registrationDeadline: new Date().toISOString(),
          groupStageDeadline: new Date().toISOString(),
          knockoutStageDeadline: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: { rounds: [], totalPlayers: 16, byeCount: 0 },
      }),
    } as any)

    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'test@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    mockUsePermissions.mockReturnValue({
      organizerRole: false,
      playerRole: true,
      canEditScores: false,
      canPublishBracket: false,
      canManageGroups: false,
      canViewAllStandings: false,
    } as any)

    mockUseAnalytics.mockReturnValue({
      track: jest.fn(),
    })
  })

  afterEach(() => {
    if (queryClient) {
      queryClient.clear()
    }
  })

  it('shows sign-in message when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
    })

    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(screen.getByText('Sign in to view tournament details')).toBeInTheDocument()
  })

  it('renders tab navigation with all tabs', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    const standingsElements = screen.getAllByText('Standings')
    const matchesElements = screen.getAllByText('Matches')
    const bracketElements = screen.getAllByText('Bracket')
    const detailsElements = screen.getAllByText('Details')

    expect(standingsElements.length).toBeGreaterThan(0)
    expect(matchesElements.length).toBeGreaterThan(0)
    expect(bracketElements.length).toBeGreaterThan(0)
    expect(detailsElements.length).toBeGreaterThan(0)
  })

  it('renders back button', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    const backButton = screen.getByLabelText('Go back')
    expect(backButton).toBeInTheDocument()
  })

  it('renders page title', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
  })

  it('displays current tab content', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    // Tournament Details heading and at least one tab should be present
    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
    const standingsTabs = screen.getAllByText('Standings')
    expect(standingsTabs.length).toBeGreaterThan(0)
  })

  it('highlights current tab', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    const { container } = renderWithRouter(<TournamentDetail />)

    // Find the Standings tab button
    const tabs = container.querySelectorAll('button')
    const standingsTab = Array.from(tabs).find((tab) =>
      tab.textContent?.includes('Standings')
    )

    // Check that it has the active styling
    expect(standingsTab?.getAttribute('aria-selected')).toBe('true')
  })

  it('renders tab subcomponent content', () => {
    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    // Component should render without error and show Standings heading
    const headings = screen.getAllByText('Standings')
    expect(headings.length).toBeGreaterThan(0)
  })


  it('renders with authenticated player', () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: '123',
        email: 'player@example.com',
        role: 'player',
      },
      isAuthenticated: true,
      loading: false,
    })

    window.history.pushState({}, 'Test', '/tournament/tournament-1/standings')
    renderWithRouter(<TournamentDetail />)

    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
  })
})
