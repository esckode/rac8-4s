/**
 * usePermissions - Role-based permission resolver
 *
 * Accepts tournamentId and returns permission flags based on user role and tournament ownership.
 * Reacts to changes in user role or tournament creatorId.
 */

import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { useTournament } from './useTournament'

export interface Permissions {
  playerRole: boolean
  organizerRole: boolean
  canEditScores: boolean
  canPublishBracket: boolean
  canManageGroups: boolean
  canViewAllStandings: boolean
  // Dual-role capabilities (orthogonal axes): authority vs. participation.
  canOrganize: boolean
  canParticipate: boolean
}

export function usePermissions(tournamentId: string): Permissions {
  const authState = useAuth()
  const tournamentState = useTournament(tournamentId)

  const permissions = useMemo(() => {
    const user = authState.user
    const tournament = tournamentState.tournament

    const isPlayer = user?.role === 'player'
    const isOrganizer = user?.role === 'organizer'
    const isCreator = isOrganizer && user && tournament && user.id === tournament.creatorId

    // Capabilities: authority (role) and participation (linked playerId) are
    // independent — an organizer with a playerId can do both.
    const canOrganize = user?.role === 'organizer' || user?.role === 'admin'
    const canParticipate = !!user?.playerId

    return {
      playerRole: isPlayer ?? false,
      organizerRole: isOrganizer ?? false,
      canEditScores: isOrganizer ?? false,
      canPublishBracket: isCreator ?? false,
      canManageGroups: isCreator ?? false,
      canViewAllStandings: isOrganizer ?? false,
      canOrganize,
      canParticipate,
    }
  }, [authState.user, tournamentState.tournament])

  return permissions
}
