/**
 * useTournament - Fetch tournament bundle via GET /tournaments/:id/bundle
 *
 * Fetches all tournament data in one request and populates stores.
 * Uses React Query for deduplication and caching.
 */

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tournament, Standing, Match } from '@shared/types'
import type { BracketData, MatchWithOpponent } from '../types'
import { tournamentStore, standingsStore, matchStore, playerCache } from '../state'
import { playersFromBundleStandings } from '../utils/standings-players'
import { useAuth } from './useAuth'
import { useAnalytics } from './useAnalytics'

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
  retryIn: number | null
  cancelAutoRetry: () => void
}

async function fetchTournamentBundle(
  tournamentId: string,
  token: string
): Promise<TournamentBundle> {
  const url = new URL(`/tournaments/${tournamentId}/bundle`, window.location.origin)

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
  const { track } = useAnalytics()
  const [retryIn, setRetryIn] = useState<number | null>(null)
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const {
    data: bundle,
    isLoading,
    error,
    refetch: queryRefetch,
  } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: async () => {
      if (!authState.user) throw new Error('Not authenticated')

      const token = localStorage.getItem('auth_token')
      if (!token) throw new Error('Not authenticated')

      const apiStart = performance.now()
      const bundle = await fetchTournamentBundle(tournamentId, token)
      const apiEnd = performance.now()

      // Measure render time using requestAnimationFrame
      const renderStart = apiEnd
      await new Promise(resolve => requestAnimationFrame(resolve))
      const renderEnd = performance.now()

      // Track time_to_data metrics
      track('time_to_data', {
        screen: 'bundle',
        apiDuration: apiEnd - apiStart,
        renderDuration: renderEnd - renderStart,
        totalDuration: renderEnd - apiStart,
        recordCount: (bundle.standings?.length ?? 0) + (bundle.matches?.group?.length ?? 0) + (bundle.matches?.knockout?.length ?? 0),
      })

      return bundle
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    enabled: !!authState.user && !!tournamentId,
    retry: 1,
  })

  const stopAutoRetry = () => {
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current)
      retryIntervalRef.current = null
    }
    setRetryIn(null)
  }

  const cancelAutoRetry = () => {
    stopAutoRetry()
  }

  // Auto-retry countdown when error occurs
  useEffect(() => {
    if (!error) {
      stopAutoRetry()
      return
    }

    const startCountdown = () => {
      setRetryIn(10)
      let remaining = 10

      retryIntervalRef.current = setInterval(() => {
        remaining -= 1
        setRetryIn(remaining)

        if (remaining <= 0) {
          stopAutoRetry()
          queryRefetch().then(
            () => { /* success, stop retrying */ },
            () => { /* failed, restart countdown */ startCountdown() }
          )
        }
      }, 1000)
    }

    startCountdown()

    return () => stopAutoRetry()
  }, [!!error, queryRefetch])

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
      // Seed the player cache so display names (incl. doubles team names) resolve
      // for matches and the bracket, which carry only participant ids.
      playerCache.setMany(playersFromBundleStandings(bundle.standings))
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
    retryIn,
    cancelAutoRetry,
  }
}
