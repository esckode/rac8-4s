import type { Tournament, Player, Match, Standing, Group } from '@shared/types'

export interface ApiError {
  code: string
  message: string
  status: number
}

export interface LoadingState<T> {
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: T
  error?: ApiError
}

export interface MatchFilter {
  status?: 'pending' | 'completed'
  type?: 'group' | 'knockout'
  round?: number
}

export type TournamentPhase = Tournament['status']

export const tournamentPhaseLabel: Record<TournamentPhase, string> = {
  draft: 'Draft',
  registration_open: 'Registration Open',
  registration_closed: 'Registration Closed',
  group_stage_active: 'Group Stage Active',
  group_stage_complete: 'Group Stage Complete',
  knockout_active: 'Knockout Active',
  tournament_complete: 'Tournament Complete',
}

export interface PublicTournamentListResponse {
  tournaments: Array<{
    id: string
    name: string
    sport: string
    matchFormat: string
    maxPlayers: number
    registrationDeadline: string
    status: string
  }>
  pagination: {
    offset: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export interface OrganizerTournamentListResponse {
  tournaments: Array<{
    id: string
    name: string
    sport: string
    status: string
    createdAt: string
  }>
  pagination: {
    offset: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export interface GroupStandingsResponse {
  standings: Array<{
    rank: number
    playerId: string
    name: string
    wins: number
    losses: number
    setsWon: number
    setsLost: number
  }>
}

export interface MatchWithOpponent extends Match {
  type: 'group' | 'knockout'
  player1Confirmed: boolean
  player2Confirmed: boolean
  opponent: {
    playerId: string | null
    name: string | null
    email: string | null
    confirmed: boolean
  }
  round?: number
  position?: number
}

export interface PlayerMatchesResponse {
  matches: MatchWithOpponent[]
}

export interface BracketRound {
  round: number
  matches: Array<{
    id: string
    round: number
    position: number
    player1Id: string | null
    player2Id: string | null
    winnerId: string | null
    score: string | null
    status: string
  }>
}

export interface BracketData {
  bracket: {
    rounds: BracketRound[]
    totalPlayers: number
    byeCount: number
  }
}

export interface StandingsUpdatedPayload {
  groupId: string
  standings: Standing[]
}

export interface BracketPublishedPayload {
  matchCount: number
  byeCount: number
}

export interface SSEHandlers {
  onStandingsUpdated: (payload: StandingsUpdatedPayload) => void
  onBracketPublished: (payload: BracketPublishedPayload) => void
  onReconnect: () => void
  onError: (error: ApiError) => void
}
