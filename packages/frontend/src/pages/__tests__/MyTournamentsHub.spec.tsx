/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyTournamentsHub } from '../MyTournamentsHub'
import { OfflineSnapshotProvider, notifyOfflineSnapshot } from '../../pwa/OfflineSnapshotContext'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))
jest.mock('../../hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../../api/client')

import { useAuth } from '../../hooks/useAuth'
import * as apiClient from '../../api/client'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockFetch = apiClient.fetchPlayerTournaments as jest.MockedFunction<typeof apiClient.fetchPlayerTournaments>

const t = (id: string, name: string) =>
  ({ id, name, sport: 'pickleball', status: 'group_stage_active', registeredAt: '2026-01-01' }) as any

const renderHub = (tab: 'standings' | 'matches') =>
  render(<MemoryRouter><MyTournamentsHub tab={tab} /></MemoryRouter>)

describe('MyTournamentsHub (0/1/2+ redirect)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'player-token')
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'p@x.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    })
  })

  it('redirects straight to the single tournament standings when in exactly one', async () => {
    mockFetch.mockResolvedValue([t('t1', 'Only One')] as any)
    renderHub('standings')
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/tournament/t1/standings', { replace: true })
    )
  })

  it('redirects straight to the single tournament matches when in exactly one', async () => {
    mockFetch.mockResolvedValue([t('t1', 'Only One')] as any)
    renderHub('matches')
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/tournament/t1/matches', { replace: true })
    )
  })

  it('lists tournaments (no redirect) when in two or more, linking to the chosen tab', async () => {
    mockFetch.mockResolvedValue([t('t1', 'Alpha'), t('t2', 'Beta')] as any)
    renderHub('standings')

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Alpha/i })).toHaveAttribute('href', '/tournament/t1/standings')
    expect(screen.getByRole('link', { name: /Beta/i })).toHaveAttribute('href', '/tournament/t2/standings')
  })

  it('shows an empty state and does not redirect when the player has none', async () => {
    mockFetch.mockResolvedValue([] as any)
    renderHub('standings')

    await waitFor(() => expect(screen.getByText(/no tournaments/i)).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('prompts sign-in when not authenticated and does not fetch', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: false })
    renderHub('matches')

    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows the guest "create a password" upgrade CTA on /matches for a guest session (ISSUE-14)', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: '', role: 'player', playerId: 'p1', isGuest: true },
      isAuthenticated: true,
      isGuest: true,
      loading: false,
    })
    mockFetch.mockResolvedValue([t('t1', 'Alpha'), t('t2', 'Beta')] as any)
    renderHub('matches')

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByTestId('guest-upgrade-cta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create a password/i })).toHaveAttribute('href', '/signup')
  })

  it('does not show the guest upgrade CTA for a registered account (ISSUE-14)', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'p@x.com', role: 'player' },
      isAuthenticated: true,
      isGuest: false,
      loading: false,
    })
    mockFetch.mockResolvedValue([t('t1', 'Alpha'), t('t2', 'Beta')] as any)
    renderHub('matches')

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByTestId('guest-upgrade-cta')).not.toBeInTheDocument()
  })

  it('shows "Updated HH:MM" on the list when /player/tournaments came from an offline snapshot (D4)', async () => {
    mockFetch.mockResolvedValue([t('t1', 'Alpha'), t('t2', 'Beta')] as any)
    const updatedAtIso = new Date(2026, 6, 18, 10, 30).toISOString()

    render(
      <MemoryRouter>
        <OfflineSnapshotProvider>
          <MyTournamentsHub tab="standings" />
        </OfflineSnapshotProvider>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())

    act(() => notifyOfflineSnapshot('/player/tournaments', updatedAtIso))

    expect(await screen.findByTestId('snapshot-updated-at')).toHaveTextContent('Updated 10:30')
  })
})
