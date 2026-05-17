import type {
  ApiError,
  PublicTournamentListResponse,
  OrganizerTournamentListResponse,
  GroupStandingsResponse,
  PlayerMatchesResponse,
  BracketData,
} from '../types'
import type { Standing } from '../../../shared/src/types'

const API_BASE = import.meta.env.REACT_APP_API_BASE || 'http://localhost:3000'

function createApiError(message: string, status: number, code?: string): ApiError {
  return {
    code: code || `HTTP_${status}`,
    message,
    status,
  }
}

async function apiFetch<T>(
  path: string,
  options: {
    method?: string
    token?: string
    body?: Record<string, unknown>
  } = {}
): Promise<T> {
  try {
    const url = new URL(path, API_BASE).toString()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`
    }

    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers,
    }

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body)
    }

    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ code: undefined }))
      throw createApiError(
        `API error: ${response.statusText}`,
        response.status,
        errorBody.code
      )
    }

    return (await response.json()) as T
  } catch (error) {
    // If it's already an ApiError, rethrow it
    if (typeof error === 'object' && error !== null && 'status' in error && 'code' in error) {
      throw error as ApiError
    }
    throw createApiError(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      'NETWORK_ERROR'
    )
  }
}

export interface PaginationParams {
  offset: number
  limit: number
}

export async function fetchPublicTournaments(
  pagination: PaginationParams
): Promise<PublicTournamentListResponse> {
  const params = new URLSearchParams({
    offset: pagination.offset.toString(),
    limit: pagination.limit.toString(),
  })
  const response = await apiFetch<PublicTournamentListResponse>(
    `/tournaments/public?${params}`
  )
  return response
}

export async function fetchOrganizerTournaments(
  token: string,
  pagination: PaginationParams
): Promise<OrganizerTournamentListResponse> {
  const params = new URLSearchParams({
    offset: pagination.offset.toString(),
    limit: pagination.limit.toString(),
  })
  const response = await apiFetch<OrganizerTournamentListResponse>(
    `/tournaments/organizer?${params}`,
    { token }
  )
  return response
}

export async function fetchStandings(
  tournamentId: string,
  groupId: string,
  token: string
): Promise<Standing[]> {
  const response = await apiFetch<GroupStandingsResponse>(
    `/tournaments/${tournamentId}/groups/${groupId}/standings`,
    { token }
  )
  return response.standings
}

export async function fetchMatches(
  tournamentId: string,
  token: string
): Promise<MatchWithOpponent[]> {
  const response = await apiFetch<PlayerMatchesResponse>(
    `/tournaments/${tournamentId}/matches`,
    { token }
  )
  return response.matches
}

export async function fetchBracket(tournamentId: string): Promise<BracketData> {
  const response = await apiFetch<BracketData>(
    `/tournaments/${tournamentId}/bracket`
  )
  return response
}

export async function submitScore(
  tournamentId: string,
  matchId: string,
  score: string,
  token: string,
  matchType: 'group' | 'knockout' = 'group'
): Promise<void> {
  const path = matchType === 'knockout'
    ? `/tournaments/${tournamentId}/knockout/${matchId}/score`
    : `/tournaments/${tournamentId}/matches/${matchId}/score`
  await apiFetch<{ message: string }>(path, { method: 'POST', token, body: { score } })
}

// Import MatchWithOpponent from types for proper typing
import type { MatchWithOpponent } from '../types'
