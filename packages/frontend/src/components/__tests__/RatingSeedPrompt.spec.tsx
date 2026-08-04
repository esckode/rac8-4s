/**
 * ISSUE-60 — self-rating seed prompt. PUT /player/ratings/seed exists and is
 * unreachable from the UI. This reusable component checks GET /player/ratings
 * for an existing bucket in the given sport; if none exists, it prompts
 * "How would you rate yourself at {sport}?" using the min/max/seedDefault
 * scale from that same response (never hardcoded), submits
 * PUT /player/ratings/seed on confirm, is skippable, and suppresses itself
 * silently on 409 RATING_ALREADY_SCORED (a normal state, not an error).
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { RatingSeedPrompt } from '../RatingSeedPrompt'

const mockFetch = jest.fn()
global.fetch = mockFetch

function ratingsResponse(ratings: Array<{ sport: string; format: string; rating: number; matchesPlayed: number; provisional: boolean }> = []) {
  return { ok: true, json: async () => ({ ratings, min: 100, max: 500, seedDefault: 270 }) }
}

describe('RatingSeedPrompt (ISSUE-60)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders the prompt when the player has no rating for the sport', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/player/ratings') return Promise.resolve(ratingsResponse([]))
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    render(<RatingSeedPrompt sport="tennis" onDone={jest.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('How would you rate yourself at tennis?')).toBeInTheDocument()
    })
  })

  it('does not render when the player already has a rating for the sport', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/player/ratings') {
        return Promise.resolve(ratingsResponse([{ sport: 'tennis', format: 'singles', rating: 300, matchesPlayed: 3, provisional: true }]))
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    render(<RatingSeedPrompt sport="tennis" onDone={jest.fn()} />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/player/ratings', expect.anything()))
    expect(screen.queryByText(/how would you rate yourself/i)).not.toBeInTheDocument()
  })

  it('presents the min/max/seedDefault scale from the API response, not hardcoded numbers', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/player/ratings') {
        return Promise.resolve({ ok: true, json: async () => ({ ratings: [], min: 50, max: 900, seedDefault: 400 }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    render(<RatingSeedPrompt sport="pickleball" onDone={jest.fn()} />)

    await waitFor(() => {
      const input = screen.getByTestId('rating-seed-input') as HTMLInputElement
      expect(input).toHaveAttribute('min', '50')
      expect(input).toHaveAttribute('max', '900')
      expect(input.value).toBe('400')
    })
  })

  it('submits PUT /player/ratings/seed with { sport, rating } and calls onDone', async () => {
    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/player/ratings') return Promise.resolve(ratingsResponse([]))
      if (url === '/player/ratings/seed' && opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ sport: 'tennis', singles: {}, doubles: {} }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    const onDone = jest.fn()
    render(<RatingSeedPrompt sport="tennis" onDone={onDone} />)

    await screen.findByTestId('rating-seed-input')
    fireEvent.change(screen.getByTestId('rating-seed-input'), { target: { value: '320' } })
    fireEvent.click(screen.getByTestId('rating-seed-submit'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(([url, o]: [string, any]) => url === '/player/ratings/seed' && o?.method === 'PUT')
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual({ sport: 'tennis', rating: 320 })
    })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('is skippable without submitting anything', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/player/ratings') return Promise.resolve(ratingsResponse([]))
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    const onDone = jest.fn()
    render(<RatingSeedPrompt sport="tennis" onDone={onDone} />)

    fireEvent.click(await screen.findByTestId('rating-seed-skip'))

    expect(onDone).toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalledWith('/player/ratings/seed', expect.anything())
  })

  it('suppresses silently on 409 RATING_ALREADY_SCORED — no error shown, onDone still called', async () => {
    mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (url === '/player/ratings') return Promise.resolve(ratingsResponse([]))
      if (url === '/player/ratings/seed' && opts?.method === 'PUT') {
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ code: 'RATING_ALREADY_SCORED', message: 'already scored' }) })
      }
      return Promise.resolve({ ok: false, json: async () => ({}) })
    })
    const onDone = jest.fn()
    render(<RatingSeedPrompt sport="tennis" onDone={onDone} />)

    fireEvent.click(await screen.findByTestId('rating-seed-submit'))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.queryByText(/already scored/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never blocks — renders nothing while the ratings check is in flight or fails', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }))
    render(<RatingSeedPrompt sport="tennis" onDone={jest.fn()} />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(screen.queryByText(/how would you rate yourself/i)).not.toBeInTheDocument()
  })
})
