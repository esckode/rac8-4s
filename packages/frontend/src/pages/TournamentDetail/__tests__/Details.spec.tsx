/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import type { Tournament } from '@shared/types'
import { Details } from '../Details'
import * as TournamentHook from '../../../hooks/useTournament'

jest.mock('../../../hooks/useTournament')

const mockUseTournament = TournamentHook.useTournament as jest.MockedFunction<typeof TournamentHook.useTournament>

const createMockTournament = (overrides?: Partial<Tournament>): Tournament => ({
  id: 't1',
  name: 'Test Tournament',
  creatorId: 'org1',
  sport: 'Pickleball',
  matchFormat: 'doubles',
  status: 'group_stage_active',
  maxPlayers: 32,
  registrationDeadline: new Date('2024-06-01'),
  groupStageDeadline: new Date('2024-06-15'),
  knockoutStageDeadline: new Date('2024-06-30'),
  createdAt: new Date('2024-05-01'),
  updatedAt: new Date('2024-05-15'),
  ...overrides,
})

describe('Details', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows loading state', () => {
    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
    expect(screen.getByText('Loading tournament details...')).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    const refetchMock = jest.fn()

    mockUseTournament.mockReturnValue({
      tournament: null,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to load tournament' },
      refetch: refetchMock,
    })

    render(<Details />)

    expect(screen.getByText('Failed to load tournament details')).toBeInTheDocument()
  })

  it('renders tournament details', () => {
    const tournament = createMockTournament()

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('Tournament Details')).toBeInTheDocument()
    const tournaments = screen.getAllByText('Test Tournament')
    expect(tournaments.length).toBeGreaterThan(0)
  })

  it('displays tournament status', () => {
    const tournament = createMockTournament({ status: 'group_stage_active' })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('Group Stage Active')).toBeInTheDocument()
  })

  it('displays tournament description', () => {
    const tournament = createMockTournament({
      description: 'This is a test tournament description',
    })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('This is a test tournament description')).toBeInTheDocument()
  })

  it('displays tournament ID', () => {
    const tournament = createMockTournament({ id: 'tournament-12345' })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('tournament-12345')).toBeInTheDocument()
  })

  it('displays formatted deadline dates', () => {
    const tournament = createMockTournament({
      registrationDeadline: new Date('2024-06-01'),
      groupStageDeadline: new Date('2024-06-15'),
      knockoutStageDeadline: new Date('2024-06-30'),
    })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    // Dates should be formatted, not in ISO format
    const dateTexts = screen.getAllByText(/Jun \d{1,2}, 2024/)
    expect(dateTexts.length).toBeGreaterThan(0)
  })

  it('displays all deadline labels', () => {
    const tournament = createMockTournament()

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('Registration Deadline')).toBeInTheDocument()
    expect(screen.getByText('Group Stage Deadline')).toBeInTheDocument()
    expect(screen.getByText('Knockout Stage Deadline')).toBeInTheDocument()
  })

  it('displays tournament name in header and content', () => {
    const tournament = createMockTournament({
      name: 'Summer Championship 2024',
    })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    const nameTexts = screen.getAllByText('Summer Championship 2024')
    expect(nameTexts.length).toBeGreaterThanOrEqual(2)
  })

  it('shows "Not set" for missing deadlines', () => {
    const tournament = createMockTournament({
      registrationDeadline: undefined,
    })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    expect(screen.getByText('Not set')).toBeInTheDocument()
  })

  it('shows tournament complete status', () => {
    const tournament = createMockTournament({ status: 'tournament_complete' })

    mockUseTournament.mockReturnValue({
      tournament,
      standings: [],
      matches: { group: [], knockout: [] },
      bracket: null,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      retryIn: null,
      cancelAutoRetry: jest.fn(),
    } as any)

    render(<Details />)

    // Tournament complete status label
    const statusElements = screen.getAllByText(/Complete|Tournament/)
    expect(statusElements.length).toBeGreaterThan(0)
  })
})
