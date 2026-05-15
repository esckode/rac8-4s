/**
 * Centralized store exports and singletons
 * All application stores are instantiated once and exported here.
 */

import { TournamentStore } from './tournament-state'
import { StandingsStore } from './standings-state'
import { MatchStore } from './match-state'
import { PlayerCache } from './player-state'

// Create singleton instances
export const tournamentStore = new TournamentStore()
export const standingsStore = new StandingsStore()
export const matchStore = new MatchStore()
export const playerCache = new PlayerCache()

// Also export classes for testing
export { TournamentStore, StandingsStore, MatchStore, PlayerCache }
