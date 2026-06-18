/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrganizerDashboard } from '../OrganizerDashboard'

jest.mock('../../hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../../hooks/usePermissions', () => ({ usePermissions: jest.fn() }))
jest.mock('../../api/client')

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import * as apiClient from '../../api/client'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>
const mockFetch = apiClient.fetchOrganizerTournaments as jest.MockedFunction<
  typeof apiClient.fetchOrganizerTournaments
>

function asOrganizer() {
  mockUseAuth.mockReturnValue({
    user: { id: 'org1', email: 'o@t.com', role: 'organizer' },
    isAuthenticated: true,
    loading: false,
  } as any)
  mockUsePermissions.mockReturnValue({ organizerRole: true } as any)
}

function render_() {
  return render(<MemoryRouter><OrganizerDashboard /></MemoryRouter>)
}

describe('OrganizerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'org-token')
  })

  it('shows a sign-in message when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: false } as any)
    mockUsePermissions.mockReturnValue({ organizerRole: false } as any)
    render_()
    expect(screen.getByText('Sign in to manage tournaments')).toBeInTheDocument()
  })

  it('shows access-required for non-organizers', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'p1', email: 'p@t.com', role: 'player' },
      isAuthenticated: true,
      loading: false,
    } as any)
    mockUsePermissions.mockReturnValue({ organizerRole: false } as any)
    render_()
    expect(screen.getByText('Organizer access required')).toBeInTheDocument()
  })

  it('loads and lists the organizer tournaments from the API with the stored token', async () => {
    asOrganizer()
    mockFetch.mockResolvedValueOnce({
      tournaments: [
        { id: 't1', name: 'Spring Open', sport: 'pickleball', status: 'registration_open', createdAt: '2026-01-01' },
        { id: 't2', name: 'Fall Cup', sport: 'tennis', status: 'draft', createdAt: '2026-02-01' },
      ],
      pagination: { offset: 0, limit: 50, total: 2, hasMore: false },
    } as any)

    render_()

    await waitFor(() => expect(screen.getAllByTestId('organizer-tournament-row')).toHaveLength(2))
    expect(mockFetch).toHaveBeenCalledWith('org-token', expect.any(Object))
    expect(screen.getByText('Spring Open')).toBeInTheDocument()
    expect(screen.getByText('Fall Cup')).toBeInTheDocument()
  })

  it('navigates to the management screen when a tournament row is clicked', async () => {
    asOrganizer()
    mockFetch.mockResolvedValueOnce({
      tournaments: [
        { id: 't1', name: 'Spring Open', sport: 'pickleball', status: 'registration_open', createdAt: '2026-01-01' },
      ],
      pagination: { offset: 0, limit: 50, total: 1, hasMore: false },
    } as any)

    render_()

    await waitFor(() => expect(screen.getByTestId('organizer-tournament-row')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('organizer-tournament-row'))
    expect(mockNavigate).toHaveBeenCalledWith('/tournament/t1/manage')
  })

  it('shows an empty state when the organizer has no tournaments', async () => {
    asOrganizer()
    mockFetch.mockResolvedValueOnce({ tournaments: [], pagination: { offset: 0, limit: 50, total: 0, hasMore: false } } as any)
    render_()
    await waitFor(() => expect(screen.getByTestId('organizer-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('organizer-tournament-row')).not.toBeInTheDocument()
  })

  it('shows an error state when the fetch fails', async () => {
    asOrganizer()
    mockFetch.mockRejectedValueOnce({ code: 'NETWORK_ERROR', message: 'boom', status: 500 })
    render_()
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument())
  })

  it('does not render a Create Tournament control (no create screen yet)', async () => {
    asOrganizer()
    mockFetch.mockResolvedValueOnce({ tournaments: [], pagination: { offset: 0, limit: 50, total: 0, hasMore: false } } as any)
    render_()
    await waitFor(() => expect(screen.getByTestId('organizer-empty')).toBeInTheDocument())
    expect(screen.queryByText(/create tournament/i)).not.toBeInTheDocument()
  })
})
