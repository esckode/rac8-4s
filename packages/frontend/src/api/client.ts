import type {
  ApiError,
  PublicTournamentListResponse,
  OrganizerTournamentListResponse,
  GroupStandingsResponse,
  PlayerMatchesResponse,
  BracketData,
} from '../types'
import { notify503 } from '../context/ServiceUnavailableContext'

const API_BASE = ''  // Use relative paths with Vite proxy (/api)

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
    // Construct URL, handling both browser (with window.location) and test environments
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const url = new URL(`${API_BASE}${path}`, baseUrl).toString()
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
      if (response.status === 503) {
        notify503()
      }
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
): Promise<GroupStandingsResponse['standings']> {
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

export interface PlayerTournamentSummary {
  id: string
  name: string
  sport: string
  status: string
  registeredAt: string
}

export async function fetchPlayerTournaments(token: string): Promise<PlayerTournamentSummary[]> {
  const response = await apiFetch<{ tournaments: PlayerTournamentSummary[] }>(
    '/player/tournaments',
    { token }
  )
  return response.tournaments
}

export async function editScore(
  tournamentId: string,
  matchId: string,
  score: string,
  token: string,
  matchType: 'group' | 'knockout' = 'group'
): Promise<void> {
  const path = matchType === 'knockout'
    ? `/tournaments/${tournamentId}/knockout/${matchId}/score`
    : `/tournaments/${tournamentId}/matches/${matchId}/score`
  await apiFetch<{ match: unknown }>(path, { method: 'PATCH', token, body: { score } })
}

export interface AvailablePartner {
  id: string
  name: string
}

export interface IncomingPartnerRequest {
  registrationId: string
  requesterId: string
  requesterName: string
}

export async function fetchAvailablePartners(
  tournamentId: string,
  token: string
): Promise<AvailablePartner[]> {
  const response = await apiFetch<{ players: AvailablePartner[] }>(
    `/tournaments/${tournamentId}/available-partners`,
    { token }
  )
  return response.players
}

export async function fetchIncomingPartnerRequests(
  tournamentId: string,
  token: string
): Promise<IncomingPartnerRequest[]> {
  const response = await apiFetch<{ requests: IncomingPartnerRequest[] }>(
    `/tournaments/${tournamentId}/partner-requests`,
    { token }
  )
  return response.requests
}

export async function sendPartnerRequest(
  tournamentId: string,
  targetPlayerId: string,
  token: string
): Promise<void> {
  await apiFetch<{ registrationId: string }>(
    `/tournaments/${tournamentId}/partner-requests`,
    { method: 'POST', token, body: { targetPlayerId } }
  )
}

export async function confirmPartner(registrationId: string, token: string): Promise<void> {
  await apiFetch<{ registrationId: string }>(
    `/tournaments/registrations/${registrationId}/confirm`,
    { method: 'PATCH', token }
  )
}

export type TransitionAction =
  | 'OPEN_REGISTRATION'
  | 'CLOSE_REGISTRATION'
  | 'START_GROUP_STAGE'
  | 'COMPLETE_GROUP_STAGE'
  | 'START_KNOCKOUT'
  | 'COMPLETE_TOURNAMENT'

export interface AdvanceResult {
  status: string
  previousStatus: string
  message: string
}

export async function advanceTournament(
  tournamentId: string,
  action: TransitionAction,
  token: string,
  forceAdvance?: boolean
): Promise<AdvanceResult> {
  const body: Record<string, unknown> = { action }
  if (forceAdvance) body.forceAdvance = true
  return apiFetch<AdvanceResult>(`/tournaments/${tournamentId}/advance`, {
    method: 'POST',
    token,
    body,
  })
}

export interface CreateGroupsBody {
  numGroups: number
  advancingPerGroup: number
  pairUnpaired?: boolean
}

export interface CreateGroupsResult {
  groups: { id: string; name: string; playerCount: number; advancingCount: number }[]
}

export async function createGroups(
  tournamentId: string,
  body: CreateGroupsBody,
  token: string
): Promise<CreateGroupsResult> {
  return apiFetch<CreateGroupsResult>(`/tournaments/${tournamentId}/groups`, {
    method: 'POST',
    token,
    body: body as unknown as Record<string, unknown>,
  })
}

export async function generateBracket(tournamentId: string, token: string): Promise<void> {
  await apiFetch<{ bracket: unknown }>(`/tournaments/${tournamentId}/bracket/generate`, {
    method: 'POST',
    token,
  })
}

export async function publishBracket(tournamentId: string, token: string): Promise<void> {
  await apiFetch<{ matches: unknown }>(`/tournaments/${tournamentId}/bracket/publish`, {
    method: 'POST',
    token,
  })
}

// Import MatchWithOpponent from types for proper typing
import type { MatchWithOpponent } from '../types'
