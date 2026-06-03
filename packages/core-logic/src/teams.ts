export interface Team {
  id: string
  tournamentId: string
  player1Id: string
  player2Id: string
  createdAt: Date
}

/**
 * Generate a unique team ID.
 * Format: team_<timestamp>_<random>
 */
export function generateTeamId(): string {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Validate that two players are different.
 * Throws if both player IDs are identical.
 */
export function validateTeamPlayers(player1Id: string, player2Id: string): void {
  if (player1Id === player2Id) {
    throw new Error('Team must contain two different players')
  }
}
