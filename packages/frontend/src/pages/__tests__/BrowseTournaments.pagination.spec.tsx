/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { BrowseTournaments } from '../BrowseTournaments'

describe('BrowseTournaments - Tournament Display', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>{component}</BrowserRouter>
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render hardcoded tournaments on mount', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Greenwood Mixed Open')).toBeInTheDocument()
    expect(screen.getByText('Spring Singles Cup')).toBeInTheDocument()
    expect(screen.getByText('Knockout Friday')).toBeInTheDocument()
  })

  it('should display featured tournament section', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('FEATURED · THIS WEEK')).toBeInTheDocument()
    expect(screen.getByText('Greenwood Mixed Open')).toBeInTheDocument()
  })

  it('should display coming up section with tournament count', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Coming up')).toBeInTheDocument()
    expect(screen.getByText('2 results')).toBeInTheDocument()
  })

  it('should display tournament details with date and venue', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText(/Sat 25 May/)).toBeInTheDocument()
    expect(screen.getByText(/Greenwood BC/)).toBeInTheDocument()
  })

  it('should have bracket view buttons for each tournament', () => {
    renderWithRouter(<BrowseTournaments />)

    const bracketButtons = screen.getAllByRole('button', { name: '🔀' })
    expect(bracketButtons.length).toBe(3)
  })

  it('should have no pagination controls', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.queryByText('Load More Tournaments')).not.toBeInTheDocument()
    expect(screen.queryByText("You've reached the end of the tournament list")).not.toBeInTheDocument()
  })

  it('should display filter buttons', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Doubles')).toBeInTheDocument()
    expect(screen.getByText('Singles')).toBeInTheDocument()
    const mixedButtons = screen.getAllByText('Mixed')
    expect(mixedButtons.length).toBeGreaterThan(0)
  })

  it('should display search interface', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Search clubs, players, venues…')).toBeInTheDocument()
  })

  it('should render all tournament elements', () => {
    renderWithRouter(<BrowseTournaments />)

    // Check for all three hardcoded tournaments
    expect(screen.getByText('Spring Singles Cup')).toBeInTheDocument()
    expect(screen.getByText('Knockout Friday')).toBeInTheDocument()

    // Verify tournament metadata is shown
    expect(screen.getByText(/Sat 24 May/)).toBeInTheDocument()
    expect(screen.getByText(/Fri 16 May/)).toBeInTheDocument()
  })
})
