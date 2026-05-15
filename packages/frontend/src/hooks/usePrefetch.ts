/**
 * usePrefetch - Prefetch data on hover/focus for faster loading
 *
 * Uses React Query's prefetchQuery to load data before user interaction.
 * Returns handlers for onMouseEnter and onFocus events.
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface PrefetchHandlers {
  handleMouseEnter: () => void
  handleFocus: () => void
}

/**
 * Prefetch tournament bundle data on hover/focus
 * @param tournamentId - Tournament ID to prefetch
 */
export function usePrefetch(tournamentId: string): PrefetchHandlers {
  const queryClient = useQueryClient()

  const prefetch = useCallback(async () => {
    if (!tournamentId) {
      return
    }

    try {
      // Prefetch the tournament bundle using React Query
      await queryClient.prefetchQuery({
        queryKey: ['tournament', tournamentId],
        // Note: actual queryFn is defined in useTournament hook
        // This prefetch will use the same queryFn when available
      })
    } catch (error) {
      // Silent fail - prefetch failures shouldn't block user interactions
      console.debug('Prefetch failed', error)
    }
  }, [tournamentId, queryClient])

  const handleMouseEnter = useCallback(() => {
    prefetch()
  }, [prefetch])

  const handleFocus = useCallback(() => {
    prefetch()
  }, [prefetch])

  return {
    handleMouseEnter,
    handleFocus,
  }
}
