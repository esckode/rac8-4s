/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlayHub } from '../PlayHub'
import { OfflineSnapshotProvider, notifyOfflineSnapshot } from '../../pwa/OfflineSnapshotContext'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))
jest.mock('../../hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../../hooks/useGroupList', () => ({ useGroupList: jest.fn() }))
jest.mock('../../api/client')

import { useAuth } from '../../hooks/useAuth'
import { useGroupList } from '../../hooks/useGroupList'
import * as apiClient from '../../api/client'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUseGroupList = useGroupList as jest.MockedFunction<typeof useGroupList>
const mockFetchTournaments = apiClient.fetchPlayerTournaments as jest.MockedFunction<typeof apiClient.fetchPlayerTournaments>
const mockFetchSnapshot = apiClient.fetchPlayerSnapshot as jest.MockedFunction<typeof apiClient.fetchPlayerSnapshot>

const t = (id: string, name: string) =>
  ({ id, name, sport: 'pickleball', status: 'group_stage_active', registeredAt: '2026-01-01' }) as any

const EMPTY_SNAPSHOT = { nextMatch: null, standingsRows: [], lastResults: [] }

const renderHub = () => render(<MemoryRouter><PlayHub /></MemoryRouter>)

describe('PlayHub (ISSUE-28)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'player-token')
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'p@x.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })
    mockUseGroupList.mockReturnValue({
      groups: [],
      loading: false,
      error: null,
      unauthorized: false,
      refetch: jest.fn(),
    })
    mockFetchSnapshot.mockResolvedValue(EMPTY_SNAPSHOT as any)
  })

  it('renders the next-match card when the snapshot has one', async () => {
    mockFetchTournaments.mockResolvedValue([t('t1', 'Alpha')] as any)
    mockFetchSnapshot.mockResolvedValue({
      nextMatch: { opponentName: 'Sam', tournamentName: 'Alpha', deadline: null },
      standingsRows: [],
      lastResults: [],
    } as any)

    renderHub()

    await waitFor(() => expect(screen.getByText(/Sam/)).toBeInTheDocument())
    expect(screen.getByTestId('next-match-card')).toBeInTheDocument()
  })

  it('does not auto-redirect when the player has exactly one tournament — the Play hub itself is the destination', async () => {
    mockFetchTournaments.mockResolvedValue([t('t1', 'Only One')] as any)

    renderHub()

    await waitFor(() => expect(screen.getByText('Only One')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('lists 2+ tournaments, each linking to its standings tab', async () => {
    mockFetchTournaments.mockResolvedValue([t('t1', 'Alpha'), t('t2', 'Beta')] as any)

    renderHub()

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Alpha/i })).toHaveAttribute('href', '/tournament/t1/standings')
    expect(screen.getByRole('link', { name: /Beta/i })).toHaveAttribute('href', '/tournament/t2/standings')
  })

  it('renders recent results from the snapshot', async () => {
    mockFetchTournaments.mockResolvedValue([t('t1', 'Alpha')] as any)
    mockFetchSnapshot.mockResolvedValue({
      nextMatch: null,
      standingsRows: [],
      lastResults: [{ opponentName: 'Jamie', score: '6-2, 6-1', won: true }],
    } as any)

    renderHub()

    await waitFor(() => expect(screen.getByText(/Jamie/)).toBeInTheDocument())
  })

  it('shows the "no groups" empty state when the player has no tournaments and no groups', async () => {
    mockFetchTournaments.mockResolvedValue([] as any)
    mockUseGroupList.mockReturnValue({
      groups: [],
      loading: false,
      error: null,
      unauthorized: false,
      refetch: jest.fn(),
    })

    renderHub()

    await waitFor(() => expect(screen.getByText(/create a group to start playing/i)).toBeInTheDocument())
    expect(screen.getByTestId('create-group-cta')).toBeInTheDocument()
  })

  it('shows the "no games yet" empty state when the player is in a group but has no tournaments', async () => {
    mockFetchTournaments.mockResolvedValue([] as any)
    mockUseGroupList.mockReturnValue({
      groups: [{ id: 'g1', name: 'Court Crew', role: 'member', memberCount: 3, assistantEnabled: true, digestEnabled: true }],
      loading: false,
      error: null,
      unauthorized: false,
      refetch: jest.fn(),
    })

    renderHub()

    await waitFor(() => expect(screen.getByText(/no games yet/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /no games yet/i })).toHaveAttribute('href', '/groups/g1')
  })

  it('prompts sign-in when not authenticated and does not fetch', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: false })
    renderHub()

    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
    expect(mockFetchTournaments).not.toHaveBeenCalled()
  })

  it('shows the guest "create a password" upgrade CTA for a guest session (carried over from MyTournamentsHub, ISSUE-14)', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: '', role: 'player', playerId: 'p1', isGuest: true },
      isAuthenticated: true,
      isGuest: true,
      loading: false,
    })
    mockFetchTournaments.mockResolvedValue([t('t1', 'Alpha')] as any)

    renderHub()

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByTestId('guest-upgrade-cta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create a password/i })).toHaveAttribute('href', '/signup')
  })

  it('does not show the guest upgrade CTA for a registered account', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'p@x.com', role: 'player' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
    })
    mockFetchTournaments.mockResolvedValue([t('t1', 'Alpha')] as any)

    renderHub()

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByTestId('guest-upgrade-cta')).not.toBeInTheDocument()
  })

  it('shows "Updated HH:MM" on the list when /player/tournaments came from an offline snapshot (D4)', async () => {
    mockFetchTournaments.mockResolvedValue([t('t1', 'Alpha')] as any)
    const updatedAtIso = new Date(2026, 6, 18, 10, 30).toISOString()

    render(
      <MemoryRouter>
        <OfflineSnapshotProvider>
          <PlayHub />
        </OfflineSnapshotProvider>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())

    act(() => notifyOfflineSnapshot('/player/tournaments', updatedAtIso))

    expect(await screen.findByTestId('snapshot-updated-at')).toHaveTextContent('Updated 10:30')
  })
})
