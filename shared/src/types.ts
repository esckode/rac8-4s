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
  status: 'registration_open' | 'registration_closed' | 'group_stage' | 'knockout' | 'complete'
  createdAt: Date
  updatedAt: Date
}

export interface Match {
  id: string
  tournamentId: string
  player1Id: string
  player2Id?: string // For singles
  status: 'pending' | 'completed' | 'walkover'
  score?: string
  deadline?: Date
}

export interface Standing {
  playerId: string
  rank: number
  wins: number
  losses: number
  setWon: number
  setLost: number
}

export interface Group {
  id: string
  tournamentId: string
  name: string
  players: string[]
  matches: Match[]
}
