/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Standings } from '../Standings'

jest.mock('../../hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../../api/client')

import { useAuth } from '../../hooks/useAuth'
import * as apiClient from '../../api/client'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockFetch = apiClient.fetchPlayerTournaments as jest.MockedFunction<typeof apiClient.fetchPlayerTournaments>

const renderWithRouter = (el: React.ReactElement) => render(<BrowserRouter>{el}</BrowserRouter>)

describe('Standings (My Tournaments hub)', () => {
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

  it('lists the player tournaments as links to their standings', async () => {
    mockFetch.mockResolvedValue([
      { id: 't1', name: 'Summer Open', sport: 'pickleball', status: 'group_stage_active', registeredAt: '2026-01-01' },
      { id: 't2', name: 'Club Singles', sport: 'pickleball', status: 'tournament_complete', registeredAt: '2026-01-02' },
    ] as any)

    renderWithRouter(<Standings />)

    await waitFor(() => expect(screen.getByText('Summer Open')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: /Summer Open/i })
    expect(link).toHaveAttribute('href', '/tournament/t1/standings')
    expect(screen.getByText('Club Singles')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('player-token')
  })

  it('shows an empty state when the player has no tournaments', async () => {
    mockFetch.mockResolvedValue([] as any)

    renderWithRouter(<Standings />)

    await waitFor(() => expect(screen.getByText(/no tournaments/i)).toBeInTheDocument())
  })

  it('prompts sign-in when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false, loading: false })

    renderWithRouter(<Standings />)

    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
