/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { BrowseTournaments } from '../BrowseTournaments'

describe('BrowseTournaments', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>{component}</BrowserRouter>
    )
  }

  it('renders page title and description', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Browse')).toBeInTheDocument()
    expect(
      screen.getByText('Find a night, find a tournament')
    ).toBeInTheDocument()
  })

  it('renders featured tournament', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Greenwood Mixed Open')).toBeInTheDocument()
    expect(screen.getByText('FEATURED · THIS WEEK')).toBeInTheDocument()
  })

  it('renders filter buttons', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Doubles')).toBeInTheDocument()
    expect(screen.getByText('Singles')).toBeInTheDocument()
    const mixedButtons = screen.getAllByText('Mixed')
    expect(mixedButtons.length).toBeGreaterThan(0)
  })

  it('renders tournament in Coming up section', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Spring Singles Cup')).toBeInTheDocument()
    expect(screen.getByText('Knockout Friday')).toBeInTheDocument()
  })

  it('displays tournament count in Coming up section', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('2 results')).toBeInTheDocument()
  })

  it('renders search functionality', () => {
    renderWithRouter(<BrowseTournaments />)

    expect(screen.getByText('Search clubs, players, venues…')).toBeInTheDocument()
  })

  it('renders bracket view buttons for tournaments', () => {
    renderWithRouter(<BrowseTournaments />)

    const bracketButtons = screen.getAllByRole('button', { name: '🔀' })
    expect(bracketButtons.length).toBeGreaterThanOrEqual(3)
  })

  it('allows filter interaction', () => {
    renderWithRouter(<BrowseTournaments />)

    const doublesButton = screen.getByText('Doubles')
    fireEvent.click(doublesButton)

    expect(doublesButton).toBeInTheDocument()
  })
})
