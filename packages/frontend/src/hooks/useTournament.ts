/**
 * useTournament - Fetch tournament bundle via GET /tournaments/:id/bundle
 *
 * Fetches all tournament data in one request and populates stores.
 * Uses React Query for deduplication and caching.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tournament, Standing, Match } from '@shared/types'
import type { BracketData, MatchWithOpponent } from '../types'
import { tournamentStore, standingsStore, matchStore } from '../state'
import { useAuth } from './useAuth'

export interface TournamentBundle {
  tournament: Tournament | null
  standings: Standing[]
  matches: {
    group: Match[]
    knockout: Match[]
  }
  bracket: BracketData['bracket'] | null
}

export interface TournamentHookState extends TournamentBundle {
  isLoading: boolean
  error: null | { code: string; message: string }
  refetch: () => Promise<void>
}

async function fetchTournamentBundle(
  tournamentId: string,
  token: string
): Promise<TournamentBundle> {
  const url = new URL(`/tournaments/${tournamentId}/bundle`, process.env.REACT_APP_API_BASE || 'http://localhost:3000')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      code: 'UNKNOWN_ERROR',
      message: response.statusText,
    }))
    throw new Error(JSON.stringify(errorBody))
  }

  return response.json()
}

export function useTournament(tournamentId: string): TournamentHookState {
  const authState = useAuth()
  const queryClient = useQueryClient()

  const {
    data: bundle,
    isLoading,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: async () => {
      if (!authState.user) throw new Error('Not authenticated')
      return fetchTournamentBundle(tournamentId, authState.user.id)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    enabled: !!authState.user && !!tournamentId,
    retry: 1,
  })

  // Update stores when bundle data arrives
  if (bundle) {
    if (bundle.tournament) {
      tournamentStore.set(bundle.tournament)
    }

    if (bundle.standings && bundle.standings.length > 0) {
      // Group standings by group if the API returns grouped data
      // For now, assume it's an array and store as-is
      standingsStore.update({
        groupId: 'all',
        standings: bundle.standings,
      })
    }

    if (bundle.matches) {
      // Note: The API returns Match objects. For now, we store them as-is.
      // TODO: Enhance API response to include match confirmation status and opponent details
      const allMatches = [
        ...bundle.matches.group.map(m => ({
          ...m,
          type: 'group' as const,
          player1Confirmed: false,
          player2Confirmed: false,
          opponent: {
            playerId: m.player2Id || null,
            name: null,
            email: null,
            confirmed: false,
          },
        })),
        ...bundle.matches.knockout.map(m => ({
          ...m,
          type: 'knockout' as const,
          player1Confirmed: false,
          player2Confirmed: false,
          opponent: {
            playerId: m.player2Id || null,
            name: null,
            email: null,
            confirmed: false,
          },
        })),
      ] as MatchWithOpponent[]
      matchStore.setMatches(allMatches)
    }
  }

  return {
    tournament: bundle?.tournament ?? null,
    standings: bundle?.standings ?? [],
    matches: bundle?.matches ?? { group: [], knockout: [] },
    bracket: bundle?.bracket ?? null,
    isLoading,
    error: error ? { code: 'FETCH_ERROR', message: error.message } : null,
    refetch: async () => {
      await queryRefetch()
    },
  }
}
