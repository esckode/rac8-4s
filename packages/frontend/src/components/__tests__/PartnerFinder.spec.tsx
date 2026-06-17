/**
 * PartnerFinder — a solo doubles registrant finds another solo registrant in the
 * same tournament and sends a partnership request.
 *
 * - On mount, loads available partners via fetchAvailablePartners with the stored
 *   session token.
 * - Each row has a "Request" button → sendPartnerRequest(tournamentId, targetId, token).
 * - On success the row shows a "pending" state (button no longer requestable).
 * - A 409 (already paired) surfaces a friendly error.
 * - Empty list shows an empty state.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PartnerFinder } from '../PartnerFinder'
import * as apiClient from '../../api/client'

jest.mock('../../api/client')

const mockFetchAvailable = apiClient.fetchAvailablePartners as jest.MockedFunction<
  typeof apiClient.fetchAvailablePartners
>
const mockSendRequest = apiClient.sendPartnerRequest as jest.MockedFunction<
  typeof apiClient.sendPartnerRequest
>

function apiError(code: string, status: number) {
  return { code, message: `API error: ${code}`, status }
}

describe('PartnerFinder', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'player-token')
  })

  it('lists available partners loaded with the stored token', async () => {
    mockFetchAvailable.mockResolvedValueOnce([
      { id: 'p2', name: 'Bea' },
      { id: 'p3', name: 'Cy' },
    ])

    render(<PartnerFinder tournamentId="t1" />)

    await waitFor(() => expect(screen.getAllByTestId('partner-row')).toHaveLength(2))
    expect(mockFetchAvailable).toHaveBeenCalledWith('t1', 'player-token')
    expect(screen.getByText('Bea')).toBeInTheDocument()
    expect(screen.getByText('Cy')).toBeInTheDocument()
  })

  it('sends a partner request and shows a pending state on success', async () => {
    mockFetchAvailable.mockResolvedValueOnce([{ id: 'p2', name: 'Bea' }])
    mockSendRequest.mockResolvedValueOnce(undefined as any)

    render(<PartnerFinder tournamentId="t1" />)

    await waitFor(() => expect(screen.getByTestId('request-partner-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('request-partner-button'))

    await waitFor(() =>
      expect(mockSendRequest).toHaveBeenCalledWith('t1', 'p2', 'player-token')
    )
    await waitFor(() => expect(screen.getByText(/pending/i)).toBeInTheDocument())
  })

  it('surfaces a friendly error when the target is already paired (409)', async () => {
    mockFetchAvailable.mockResolvedValueOnce([{ id: 'p2', name: 'Bea' }])
    mockSendRequest.mockRejectedValueOnce(apiError('INVALID_STATE', 409))

    render(<PartnerFinder tournamentId="t1" />)

    await waitFor(() => expect(screen.getByTestId('request-partner-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('request-partner-button'))

    await waitFor(() => expect(screen.getByTestId('partner-error')).toBeInTheDocument())
  })

  it('shows an empty state when no partners are available', async () => {
    mockFetchAvailable.mockResolvedValueOnce([])

    render(<PartnerFinder tournamentId="t1" />)

    await waitFor(() => expect(screen.getByTestId('partner-finder')).toBeInTheDocument())
    expect(screen.queryByTestId('partner-row')).not.toBeInTheDocument()
    expect(screen.getByText(/no.*partners/i)).toBeInTheDocument()
  })
})
