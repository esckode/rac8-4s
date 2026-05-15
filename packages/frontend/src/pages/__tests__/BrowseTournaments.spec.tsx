/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { BrowseTournaments } from '../BrowseTournaments'

jest.mock('../../api/client', () => ({
  fetchPublicTournaments: jest.fn(),
}))

jest.mock('../../hooks/useInfiniteScroll', () => ({
  useInfiniteScroll: jest.fn(),
}))

import { fetchPublicTournaments } from '../../api/client'
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll'

const mockFetchPublicTournaments = fetchPublicTournaments as jest.MockedFunction<
  typeof fetchPublicTournaments
>
const mockUseInfiniteScroll = useInfiniteScroll as jest.MockedFunction<
  typeof useInfiniteScroll
>

describe('BrowseTournaments', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>)
  }

  const mockTournament = {
    id: '1',
    name: 'Test Tournament',
    sport: 'Pickleball',
    matchFormat: 'Doubles',
    maxPlayers: 16,
    registrationDeadline: '2026-06-01',
    status: 'registration_open',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders page title and description', () => {
    mockUseInfiniteScroll.mockReturnValue({
      items: [],
      hasMore: false,
      offset: 0,
      loadMore: jest.fn(),
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Browse Tournaments')).toBeInTheDocument()
    expect(
      screen.getByText('Discover and join pickleball tournaments in your area')
    ).toBeInTheDocument()
  })

  it('renders tournaments from the list', () => {
    const mockLoadMore = jest.fn()
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament],
      hasMore: false,
      offset: 20,
      loadMore: mockLoadMore,
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Test Tournament')).toBeInTheDocument()
  })

  it('renders Load More button when hasMore is true', () => {
    const mockLoadMore = jest.fn()
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament],
      hasMore: true,
      offset: 20,
      loadMore: mockLoadMore,
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Load More Tournaments')).toBeInTheDocument()
  })

  it('disables Load More button when loading', () => {
    const mockLoadMore = jest.fn()
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament],
      hasMore: true,
      offset: 20,
      loadMore: mockLoadMore,
      isLoading: true,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    const button = screen.getByText('Loading...')
    expect(button).toBeDisabled()
  })

  it('calls loadMore when Load More button is clicked', () => {
    const mockLoadMore = jest.fn()
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament],
      hasMore: true,
      offset: 20,
      loadMore: mockLoadMore,
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    const button = screen.getByText('Load More Tournaments')
    fireEvent.click(button)

    expect(mockLoadMore).toHaveBeenCalled()
  })

  it('shows empty state when no tournaments found', () => {
    mockUseInfiniteScroll.mockReturnValue({
      items: [],
      hasMore: false,
      offset: 0,
      loadMore: jest.fn(),
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('No tournaments found')).toBeInTheDocument()
  })

  it('hides Load More button when hasMore is false', () => {
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament],
      hasMore: false,
      offset: 20,
      loadMore: jest.fn(),
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(screen.queryByText('Load More Tournaments')).not.toBeInTheDocument()
  })

  it('shows end of list message when no more tournaments', () => {
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament],
      hasMore: false,
      offset: 20,
      loadMore: jest.fn(),
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(
      screen.getByText("You've reached the end of the tournament list")
    ).toBeInTheDocument()
  })

  it('renders multiple tournaments in a grid', () => {
    const mockTournament2 = { ...mockTournament, id: '2', name: 'Second Tournament' }
    mockUseInfiniteScroll.mockReturnValue({
      items: [mockTournament, mockTournament2],
      hasMore: false,
      offset: 40,
      loadMore: jest.fn(),
      isLoading: false,
    } as any)

    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Test Tournament')).toBeInTheDocument()
    expect(screen.getByText('Second Tournament')).toBeInTheDocument()
  })
})
