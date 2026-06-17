/**
 * OrganizerManage — the tournament creator drives the lifecycle:
 * open/close registration, create groups, advance stages, generate+publish bracket.
 *
 * Action shown is driven by tournament.status; gated on
 * usePermissions().canManageGroups. GUARD_FAILED offers an explicit force-advance.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OrganizerManage } from '../OrganizerManage'
import * as apiClient from '../../api/client'
import * as permissionsHook from '../../hooks/usePermissions'
import * as tournamentHook from '../../hooks/useTournament'

jest.mock('../../api/client')
jest.mock('../../hooks/usePermissions')
jest.mock('../../hooks/useTournament')

const mockAdvance = apiClient.advanceTournament as jest.MockedFunction<typeof apiClient.advanceTournament>
const mockGenerate = apiClient.generateBracket as jest.MockedFunction<typeof apiClient.generateBracket>
const mockPublish = apiClient.publishBracket as jest.MockedFunction<typeof apiClient.publishBracket>
const mockUsePermissions = permissionsHook.usePermissions as jest.MockedFunction<typeof permissionsHook.usePermissions>
const mockUseTournament = tournamentHook.useTournament as jest.MockedFunction<typeof tournamentHook.useTournament>

const refetch = jest.fn()

function setup(status: string, opts: { canManageGroups?: boolean; matchFormat?: string } = {}) {
  mockUsePermissions.mockReturnValue({
    canManageGroups: opts.canManageGroups ?? true,
    organizerRole: true,
    playerRole: false,
    canEditScores: true,
    canPublishBracket: true,
    canViewAllStandings: true,
  } as any)
  mockUseTournament.mockReturnValue({
    tournament: { id: 't1', name: 'Cup', status, matchFormat: opts.matchFormat ?? 'singles' },
    refetch,
  } as any)
  return render(
    <MemoryRouter initialEntries={['/tournament/t1/manage']}>
      <Routes>
        <Route path="/tournament/:tournamentId/manage" element={<OrganizerManage />} />
      </Routes>
    </MemoryRouter>
  )
}

function apiError(code: string, status: number) {
  return { code, message: `API error: ${code}`, status }
}

describe('OrganizerManage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'org-token')
  })

  it('shows not-authorized when the user cannot manage groups', () => {
    setup('registration_open', { canManageGroups: false })
    expect(screen.getByTestId('not-authorized')).toBeInTheDocument()
    expect(screen.queryByTestId('close-registration-button')).not.toBeInTheDocument()
  })

  it('draft → open registration', async () => {
    mockAdvance.mockResolvedValueOnce({ status: 'registration_open' } as any)
    setup('draft')
    fireEvent.click(screen.getByTestId('open-registration-button'))
    await waitFor(() => expect(mockAdvance).toHaveBeenCalledWith('t1', 'OPEN_REGISTRATION', 'org-token'))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
  })

  it('registration_open → close registration', async () => {
    mockAdvance.mockResolvedValueOnce({ status: 'registration_closed' } as any)
    setup('registration_open')
    fireEvent.click(screen.getByTestId('close-registration-button'))
    await waitFor(() => expect(mockAdvance).toHaveBeenCalledWith('t1', 'CLOSE_REGISTRATION', 'org-token'))
  })

  it('registration_closed → renders the create-groups form', () => {
    setup('registration_closed', { matchFormat: 'doubles' })
    expect(screen.getByTestId('create-groups-form')).toBeInTheDocument()
    expect(screen.getByTestId('pair-unpaired-toggle')).toBeInTheDocument()
  })

  it('group_stage_active → complete group stage, with force on GUARD_FAILED', async () => {
    mockAdvance
      .mockRejectedValueOnce(apiError('GUARD_FAILED', 409))
      .mockResolvedValueOnce({ status: 'group_stage_complete' } as any)
    setup('group_stage_active')

    fireEvent.click(screen.getByTestId('complete-group-stage-button'))
    await waitFor(() => expect(screen.getByTestId('manage-error')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('force-advance-button')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('force-advance-button'))
    await waitFor(() =>
      expect(mockAdvance).toHaveBeenLastCalledWith('t1', 'COMPLETE_GROUP_STAGE', 'org-token', true)
    )
  })

  it('group_stage_complete → generate then publish bracket', async () => {
    mockGenerate.mockResolvedValueOnce(undefined as any)
    mockPublish.mockResolvedValueOnce(undefined as any)
    setup('group_stage_complete')

    fireEvent.click(screen.getByTestId('generate-bracket-button'))
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('t1', 'org-token'))
    await waitFor(() => expect(mockPublish).toHaveBeenCalledWith('t1', 'org-token'))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
  })

  it('knockout_active → complete tournament', async () => {
    mockAdvance.mockResolvedValueOnce({ status: 'tournament_complete' } as any)
    setup('knockout_active')
    fireEvent.click(screen.getByTestId('complete-tournament-button'))
    await waitFor(() => expect(mockAdvance).toHaveBeenCalledWith('t1', 'COMPLETE_TOURNAMENT', 'org-token'))
  })

  it('tournament_complete → no action buttons', () => {
    setup('tournament_complete')
    expect(screen.queryByTestId('open-registration-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('close-registration-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('complete-tournament-button')).not.toBeInTheDocument()
  })
})
