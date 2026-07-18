import {
  fetchPublicTournaments,
  fetchOrganizerTournaments,
  fetchStandings,
  fetchMatches,
  fetchBracket,
  fetchPlayerTournaments,
  submitScore,
} from '../api/client'
import * as OfflineSnapshot from '../pwa/OfflineSnapshotContext'
import type { ApiError, PublicTournamentListResponse, OrganizerTournamentListResponse, GroupStandingsResponse, PlayerMatchesResponse, BracketData } from '../types'

jest.mock('../pwa/OfflineSnapshotContext', () => ({
  notifyOfflineSnapshot: jest.fn(),
  clearOfflineSnapshot: jest.fn(),
}))

// Polyfill Response for jsdom test environment
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    body: string
    status: number
    headers: Map<string, string>
    ok: boolean

    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status || 200
      this.headers = new Map(Object.entries(init?.headers ?? {}))
      this.ok = this.status >= 200 && this.status < 300
    }

    json() {
      return Promise.resolve(JSON.parse(this.body))
    }

    text() {
      return Promise.resolve(this.body)
    }
  } as any
}

describe('API Client', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchPublicTournaments', () => {
    it('should construct correct URL with pagination params', async () => {
      const mockResponse: PublicTournamentListResponse = {
        tournaments: [],
        pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchPublicTournaments({ offset: 0, limit: 10 })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/public?offset=0&limit=10'),
        expect.any(Object)
      )
    })

    it('should not include Authorization header', async () => {
      const mockResponse: PublicTournamentListResponse = {
        tournaments: [],
        pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchPublicTournaments({ offset: 0, limit: 10 })

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const options = call[1] as RequestInit
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    })

    it('should return parsed response on 200', async () => {
      const mockResponse: PublicTournamentListResponse = {
        tournaments: [
          {
            id: 'tour_1',
            name: 'Test Tournament',
            sport: 'tennis',
            matchFormat: 'singles',
            maxPlayers: 8,
            registrationDeadline: '2026-05-20',
            status: 'registration_open',
          },
        ],
        pagination: { offset: 0, limit: 10, total: 1, hasMore: false },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await fetchPublicTournaments({ offset: 0, limit: 10 })

      expect(result.tournaments).toHaveLength(1)
      expect(result.tournaments[0].id).toBe('tour_1')
    })

    it('should throw ApiError on 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 })
      )

      await expect(
        fetchPublicTournaments({ offset: 0, limit: 10 })
      ).rejects.toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        status: 401,
      })
    })

    it('should throw ApiError on 500', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 })
      )

      await expect(
        fetchPublicTournaments({ offset: 0, limit: 10 })
      ).rejects.toMatchObject({
        status: 500,
      })
    })

    it('should wrap network errors into ApiError', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'))

      await expect(
        fetchPublicTournaments({ offset: 0, limit: 10 })
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.any(String),
      })
    })
  })

  describe('fetchOrganizerTournaments', () => {
    it('should include Authorization header with token', async () => {
      const mockResponse: OrganizerTournamentListResponse = {
        tournaments: [],
        pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchOrganizerTournaments('token_abc', { offset: 0, limit: 10 })

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const options = call[1] as RequestInit
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_abc',
      })
    })

    it('should construct correct URL with pagination', async () => {
      const mockResponse: OrganizerTournamentListResponse = {
        tournaments: [],
        pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchOrganizerTournaments('token_abc', { offset: 20, limit: 15 })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/organizer?offset=20&limit=15'),
        expect.any(Object)
      )
    })

    it('should throw ApiError on 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 })
      )

      await expect(
        fetchOrganizerTournaments('invalid_token', { offset: 0, limit: 10 })
      ).rejects.toMatchObject({
        status: 401,
      })
    })
  })

  describe('fetchStandings', () => {
    it('should construct correct URL with tournamentId and groupId', async () => {
      const mockResponse: GroupStandingsResponse = {
        standings: [],
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchStandings('tour_123', 'group_456', 'token_abc')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tour_123/groups/group_456/standings'),
        expect.any(Object)
      )
    })

    it('should include Authorization header', async () => {
      const mockResponse: GroupStandingsResponse = {
        standings: [],
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchStandings('tour_123', 'group_456', 'token_xyz')

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const options = call[1] as RequestInit
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_xyz',
      })
    })

    it('should return parsed standings array', async () => {
      const mockResponse: GroupStandingsResponse = {
        standings: [
          {
            rank: 1,
            playerId: 'p1',
            name: 'Alice',
            wins: 2,
            losses: 0,
            setsWon: 4,
            setsLost: 1,
          },
        ],
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await fetchStandings('tour_123', 'group_456', 'token_abc')

      expect(result).toHaveLength(1)
      expect(result[0].rank).toBe(1)
      expect(result[0].playerId).toBe('p1')
    })

    it('should throw ApiError on 404', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 })
      )

      await expect(
        fetchStandings('invalid_tour', 'group_456', 'token_abc')
      ).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe('fetchMatches', () => {
    it('should construct correct URL with tournamentId', async () => {
      const mockResponse: PlayerMatchesResponse = {
        matches: [],
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchMatches('tour_123', 'token_abc')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tour_123/matches'),
        expect.any(Object)
      )
    })

    it('should include Authorization header', async () => {
      const mockResponse: PlayerMatchesResponse = {
        matches: [],
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchMatches('tour_123', 'token_xyz')

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const options = call[1] as RequestInit
      expect((options.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer token_xyz'
      )
    })

    it('should return parsed matches array', async () => {
      const mockResponse: PlayerMatchesResponse = {
        matches: [
          {
            id: 'match_1',
            tournamentId: 'tour_123',
            player1Id: 'p1',
            player2Id: 'p2',
            status: 'pending',
            type: 'group',
            player1Confirmed: false,
            player2Confirmed: false,
            opponent: {
              playerId: 'p2',
              name: 'Bob',
              email: 'bob@test.com',
              confirmed: false,
            },
          },
        ],
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await fetchMatches('tour_123', 'token_abc')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('match_1')
      expect(result[0].opponent.name).toBe('Bob')
    })
  })

  describe('fetchBracket', () => {
    it('should construct correct URL with tournamentId', async () => {
      const mockResponse: BracketData = {
        bracket: {
          rounds: [],
          totalPlayers: 4,
          byeCount: 0,
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchBracket('tour_123')

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tournaments/tour_123/bracket'),
        expect.any(Object)
      )
    })

    it('should not include Authorization header', async () => {
      const mockResponse: BracketData = {
        bracket: {
          rounds: [],
          totalPlayers: 4,
          byeCount: 0,
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await fetchBracket('tour_123')

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const options = call[1] as RequestInit
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    })

    it('should return parsed bracket data', async () => {
      const mockResponse: BracketData = {
        bracket: {
          rounds: [
            {
              round: 1,
              matches: [
                {
                  id: 'match_1',
                  round: 1,
                  position: 1,
                  player1Id: 'p1',
                  player2Id: 'p2',
                  winnerId: null,
                  score: null,
                  status: 'pending',
                },
              ],
            },
          ],
          totalPlayers: 4,
          byeCount: 0,
        },
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await fetchBracket('tour_123')

      expect(result.bracket.rounds).toHaveLength(1)
      expect(result.bracket.totalPlayers).toBe(4)
      expect(result.bracket.byeCount).toBe(0)
    })

    it('should throw ApiError on 404 when bracket not generated', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'BRACKET_NOT_GENERATED' }),
          { status: 404 }
        )
      )

      await expect(fetchBracket('tour_123')).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe('fetchPlayerTournaments — offline snapshot notification (D4)', () => {
    it('calls notifyOfflineSnapshot with the cached-at header when sw-cache: fallback is present', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ tournaments: [] }), {
          status: 200,
          headers: { 'sw-cache': 'fallback', 'sw-cached-at': '2026-07-18T10:30:00.000Z' },
        })
      )

      await fetchPlayerTournaments('token_abc')

      expect(OfflineSnapshot.notifyOfflineSnapshot).toHaveBeenCalledWith(
        '/player/tournaments',
        '2026-07-18T10:30:00.000Z'
      )
      expect(OfflineSnapshot.clearOfflineSnapshot).not.toHaveBeenCalled()
    })

    it('calls clearOfflineSnapshot on a normal (non-fallback) response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ tournaments: [] }), { status: 200 })
      )

      await fetchPlayerTournaments('token_abc')

      expect(OfflineSnapshot.clearOfflineSnapshot).toHaveBeenCalledWith('/player/tournaments')
      expect(OfflineSnapshot.notifyOfflineSnapshot).not.toHaveBeenCalled()
    })
  })

  describe('submitScore', () => {
    it('returns { queued: false } on a normal 200 success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ message: 'ok' }), { status: 200 })
      )

      const result = await submitScore('tour_123', 'match_1', '11-9, 11-7', 'token_abc')

      expect(result).toEqual({ queued: false })
    })

    it('returns { queued: true } on a 202 with code QUEUED (offline, SW-synthesized)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'QUEUED', id: 'q-1' }), { status: 202 })
      )

      const result = await submitScore('tour_123', 'match_1', '11-9, 11-7', 'token_abc')

      expect(result).toEqual({ queued: true })
    })
  })
})
