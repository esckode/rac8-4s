// Shared types across all packages

export interface Player {
  id: string
  name: string
  email: string
}

export interface Tournament {
  id: string
  name: string
  sport: string
  matchFormat: 'singles' | 'doubles'
  creatorId: string
  maxPlayers: number
  description?: string
  registrationDeadline: string | Date
  groupStageDeadline: string | Date
  knockoutStageDeadline: string | Date
  status: 'draft' | 'registration_open' | 'registration_closed' | 'group_stage_active' | 'group_stage_complete' | 'knockout_active' | 'tournament_complete'
  createdAt: string | Date
  updatedAt: string | Date
}

export interface Match {
  id: string
  tournamentId: string
  player1Id: string
  player2Id?: string // For singles
  status: 'pending' | 'completed' | 'walkover'
  score?: string
  scoredBy?: string | null
  deadline?: Date
}

export interface Standing {
  participantId: string  // Can be playerId or teamId
  rank: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

export interface Group {
  id: string
  tournamentId: string
  name: string
  players: string[]
  matches: Match[]
}
