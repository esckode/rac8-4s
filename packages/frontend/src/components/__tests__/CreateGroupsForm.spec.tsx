/**
 * CreateGroupsForm — organizer divides registered participants into groups.
 *
 * - numGroups + advancingPerGroup inputs.
 * - pairUnpaired toggle shown ONLY for doubles (controls auto-pairing of leftover
 *   solo registrants; default on).
 * - Submit calls createGroups(tournamentId, { numGroups, advancingPerGroup,
 *   pairUnpaired? }, token); backend error codes map to friendly messages.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateGroupsForm } from '../CreateGroupsForm'
import * as apiClient from '../../api/client'

jest.mock('../../api/client')

const mockCreateGroups = apiClient.createGroups as jest.MockedFunction<typeof apiClient.createGroups>

function apiError(code: string, status: number) {
  return { code, message: `API error: ${code}`, status }
}

describe('CreateGroupsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'org-token')
  })

  it('renders group inputs; pairUnpaired toggle only for doubles', () => {
    const { rerender } = render(
      <CreateGroupsForm tournamentId="t1" isDoubles={false} onCreated={jest.fn()} />
    )
    expect(screen.getByTestId('num-groups-input')).toBeInTheDocument()
    expect(screen.getByTestId('advancing-input')).toBeInTheDocument()
    expect(screen.queryByTestId('pair-unpaired-toggle')).not.toBeInTheDocument()

    rerender(<CreateGroupsForm tournamentId="t1" isDoubles={true} onCreated={jest.fn()} />)
    expect(screen.getByTestId('pair-unpaired-toggle')).toBeInTheDocument()
  })

  it('submits the entered values and calls onCreated on success (doubles, pairUnpaired off)', async () => {
    mockCreateGroups.mockResolvedValueOnce({ groups: [] } as any)
    const onCreated = jest.fn()

    render(<CreateGroupsForm tournamentId="t1" isDoubles={true} onCreated={onCreated} />)

    fireEvent.change(screen.getByTestId('num-groups-input'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('advancing-input'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('pair-unpaired-toggle')) // default on → off
    fireEvent.click(screen.getByTestId('create-groups-submit'))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(mockCreateGroups).toHaveBeenCalledWith(
      't1',
      { numGroups: 2, advancingPerGroup: 1, pairUnpaired: false },
      'org-token'
    )
  })

  it('shows a friendly error on 409 INVALID_STATE and does not call onCreated', async () => {
    mockCreateGroups.mockRejectedValueOnce(apiError('INVALID_STATE', 409))
    const onCreated = jest.fn()

    render(<CreateGroupsForm tournamentId="t1" isDoubles={false} onCreated={onCreated} />)

    fireEvent.change(screen.getByTestId('num-groups-input'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('advancing-input'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('create-groups-submit'))

    await waitFor(() => expect(screen.getByTestId('groups-error')).toBeInTheDocument())
    expect(onCreated).not.toHaveBeenCalled()
  })
})
