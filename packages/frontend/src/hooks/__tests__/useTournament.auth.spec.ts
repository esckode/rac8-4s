/**
 * useTournament — bundle authorization
 *
 * The bundle request must be authenticated with the caller's real session
 * token (stored under localStorage 'auth_token'), NOT the user id. Sending
 * user.id as the Bearer token is the defect that blocked the player browser
 * flow: the bundle endpoint rejected it as an invalid player session.
 */
import { renderHook } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useTournament } from '../useTournament'
import { useAuth } from '../useAuth'

jest.mock('@tanstack/react-query')
jest.mock('../useAuth')
jest.mock('../useAnalytics', () => ({
  useAnalytics: () => ({ track: jest.fn() }),
}))
jest.mock('../../state', () => ({
  tournamentStore: { set: jest.fn() },
  standingsStore: { update: jest.fn() },
  matchStore: { setMatches: jest.fn() },
  playerCache: {},
}))

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('useTournament — bundle authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Map(),
      json: async () => ({
        tournament: null,
        standings: [],
        matches: { group: [], knockout: [] },
        bracket: null,
      }),
    })
  })

  it('sends the stored session token (not the user id) in the bundle request', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'player-789', email: '', role: 'player' },
      isAuthenticated: true,
      loading: false,
    } as any)

    // Capture the queryFn React Query would run, then invoke it directly
    let capturedQueryFn: (() => Promise<unknown>) | undefined
    mockUseQuery.mockImplementation((opts: any) => {
      capturedQueryFn = opts.queryFn
      return { data: undefined, isLoading: false, error: null, refetch: jest.fn() } as any
    })

    localStorage.setItem('auth_token', 'real-session-token')

    renderHook(() => useTournament('tourn_123'))

    expect(capturedQueryFn).toBeDefined()
    await capturedQueryFn!()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(String(url)).toContain('/tournaments/tourn_123/bundle')
    expect(init.headers.Authorization).toBe('Bearer real-session-token')
  })
})
