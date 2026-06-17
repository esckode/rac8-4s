/**
 * PartnerRequestConfirm — the target of a partnership request confirms it,
 * forming the team.
 *
 * - Reads :registrationId from the route.
 * - "Confirm Partnership" → confirmPartner(registrationId, token) → success state.
 * - 403 (only the partner can confirm) / 409 (not pending) → friendly error.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PartnerRequestConfirm } from '../PartnerRequestConfirm'
import * as apiClient from '../../api/client'

jest.mock('../../api/client')

const mockConfirm = apiClient.confirmPartner as jest.MockedFunction<typeof apiClient.confirmPartner>

function apiError(code: string, status: number) {
  return { code, message: `API error: ${code}`, status }
}

function renderAt(registrationId: string) {
  return render(
    <MemoryRouter initialEntries={[`/registrations/${registrationId}/confirm`]}>
      <Routes>
        <Route path="/registrations/:registrationId/confirm" element={<PartnerRequestConfirm />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PartnerRequestConfirm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'player-token')
  })

  it('confirms the partnership with the registrationId from the route and shows success', async () => {
    mockConfirm.mockResolvedValueOnce(undefined as any)

    renderAt('reg_1')

    fireEvent.click(screen.getByTestId('confirm-partnership-button'))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('reg_1', 'player-token'))
    await waitFor(() => expect(screen.getByTestId('confirm-success')).toBeInTheDocument())
  })

  it('shows a friendly error when only the partner can confirm (403)', async () => {
    mockConfirm.mockRejectedValueOnce(apiError('FORBIDDEN', 403))

    renderAt('reg_1')

    fireEvent.click(screen.getByTestId('confirm-partnership-button'))

    await waitFor(() => expect(screen.getByTestId('confirm-error')).toBeInTheDocument())
    expect(screen.queryByTestId('confirm-success')).not.toBeInTheDocument()
  })

  it('shows a friendly error when the request is no longer pending (409)', async () => {
    mockConfirm.mockRejectedValueOnce(apiError('INVALID_STATE', 409))

    renderAt('reg_1')

    fireEvent.click(screen.getByTestId('confirm-partnership-button'))

    await waitFor(() => expect(screen.getByTestId('confirm-error')).toBeInTheDocument())
  })
})
