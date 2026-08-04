/**
 * ISSUE-59 — Ratings page (P13 Phase 7/13 content, moved out of Profile).
 *
 * Renders the caller's current rating per sport/format from GET /player/ratings
 * (with the provisional flag) and the last-10-partners list from
 * GET /player/partners. Ported from Profile.spec.tsx's "Your Rating" /
 * "Recent Partners" cases, which now assert those sections are GONE from Profile.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { Ratings } from '../Ratings'

const mockFetch = jest.fn()
global.fetch = mockFetch

function ratingsResponse(
  ratings: Array<{ sport: string; format: string; rating: number; matchesPlayed: number; provisional: boolean }> = []
) {
  return {
    ok: true,
    headers: { get: () => undefined },
    json: async () => ({ ratings, min: 100, max: 500, seedDefault: 270 }),
  }
}

function partnersResponse(
  partners: Array<{ playerId: string; name: string; lastPartneredAt: string }> = []
) {
  return {
    ok: true,
    headers: { get: () => undefined },
    json: async () => ({ partners }),
  }
}

function mockFetchRouter(
  ratings: Array<{ sport: string; format: string; rating: number; matchesPlayed: number; provisional: boolean }> = [],
  partners: Array<{ playerId: string; name: string; lastPartneredAt: string }> = []
) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/player/ratings')) return Promise.resolve(ratingsResponse(ratings))
    if (url.includes('/player/partners')) return Promise.resolve(partnersResponse(partners))
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
}

describe('Ratings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  it('renders with data-testid="ratings-page"', async () => {
    mockFetchRouter()
    render(<Ratings />)
    await waitFor(() => {
      expect(screen.getByTestId('ratings-page')).toBeInTheDocument()
    })
  })

  it('renders a rating with the (provisional) label when provisional', async () => {
    mockFetchRouter([{ sport: 'Tennis', format: 'singles', rating: 320, matchesPlayed: 5, provisional: true }])
    render(<Ratings />)
    await waitFor(() => {
      expect(screen.getByTestId('rating-Tennis-singles')).toBeInTheDocument()
      expect(screen.getByText(/320/)).toBeInTheDocument()
      expect(screen.getByText(/provisional/)).toBeInTheDocument()
    })
  })

  it('renders a rating without the (provisional) label when not provisional', async () => {
    mockFetchRouter([{ sport: 'Tennis', format: 'doubles', rating: 280, matchesPlayed: 10, provisional: false }])
    render(<Ratings />)
    await waitFor(() => {
      expect(screen.getByTestId('rating-Tennis-doubles')).toBeInTheDocument()
      expect(screen.getByText(/280/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/provisional/)).not.toBeInTheDocument()
  })

  it('renders a not-yet-played state for a sport with no buckets', async () => {
    mockFetchRouter([])
    render(<Ratings />)
    await waitFor(() => {
      expect(screen.getByTestId('rating-empty-state')).toBeInTheDocument()
      expect(screen.getByText(/not yet played/i)).toBeInTheDocument()
    })
  })

  it('renders each partner by name with the date last partnered', async () => {
    const lastPartneredAt1 = '2026-07-20T00:00:00.000Z'
    const lastPartneredAt2 = '2026-07-10T00:00:00.000Z'
    mockFetchRouter([], [
      { playerId: 'player_1', name: 'Alex Kim', lastPartneredAt: lastPartneredAt1 },
      { playerId: 'player_2', name: 'Sam Rivera', lastPartneredAt: lastPartneredAt2 },
    ])
    render(<Ratings />)
    await waitFor(() => {
      expect(screen.getByTestId('partner-player_1')).toBeInTheDocument()
      expect(screen.getByText('Alex Kim')).toBeInTheDocument()
      expect(screen.getByText(new Date(lastPartneredAt1).toLocaleDateString())).toBeInTheDocument()
      expect(screen.getByTestId('partner-player_2')).toBeInTheDocument()
      expect(screen.getByText('Sam Rivera')).toBeInTheDocument()
      expect(screen.getByText(new Date(lastPartneredAt2).toLocaleDateString())).toBeInTheDocument()
    })
  })

  it('renders an empty state for a player who has never played doubles', async () => {
    mockFetchRouter([], [])
    render(<Ratings />)
    await waitFor(() => {
      expect(screen.getByTestId('partners-empty-state')).toBeInTheDocument()
    })
    expect(screen.queryByTestId(/^partner-/)).not.toBeInTheDocument()
  })
})
