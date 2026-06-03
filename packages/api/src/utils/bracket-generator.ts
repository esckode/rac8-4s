import { getLogger } from '../logger'

const log = getLogger('bracket-generator')

export interface BracketMatch {
  round: string
  position: number
  participant1Id: string | null
  participant2Id: string | null
  format: 'singles' | 'doubles'
}

/**
 * Generate a single-elimination bracket from qualified participants.
 * Seeding is based on the order of qualified teams (first is top seed).
 * Generates all rounds including placeholders for future rounds.
 */
export function generateBracket(
  qualifiedParticipantIds: string[],
  format: 'singles' | 'doubles' = 'singles'
): BracketMatch[] {
  if (qualifiedParticipantIds.length < 2) {
    throw new Error('At least 2 participants required to generate bracket')
  }

  const bracket: BracketMatch[] = []
  let roundNumber = 1
  let currentRoundParticipants = qualifiedParticipantIds

  // Build all rounds of the bracket
  while (currentRoundParticipants.length > 1) {
    const roundName = `round_${roundNumber}`
    const nextRoundParticipants: string[] = []
    let matchPositionInRound = 0

    // Pair up participants for this round
    for (let i = 0; i < currentRoundParticipants.length; i += 2) {
      const participant1 = currentRoundParticipants[i]
      const participant2 = currentRoundParticipants[i + 1] || null

      bracket.push({
        round: roundName,
        position: matchPositionInRound++,
        participant1Id: participant1,
        participant2Id: participant2,
        format
      })

      // Add placeholder (null) for winner to advance to next round
      nextRoundParticipants.push(null as any)
    }

    // Move to next round with empty slots (nulls) that will be filled by winners
    currentRoundParticipants = nextRoundParticipants
    roundNumber++
  }

  return bracket
}

/**
 * Determine qualified participants from standings.
 * Returns top N participants (typically 2 for finals, 4 for semis, 8 for quarters).
 */
export function getQualifiedParticipants(
  standings: Array<{ participantId: string; wins: number; losses: number }>,
  count: number = 2
): string[] {
  if (standings.length === 0) {
    throw new Error('No standings available')
  }

  // Sort by wins (descending), then losses (ascending)
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) {
      return b.wins - a.wins
    }
    return a.losses - b.losses
  })

  return sorted.slice(0, Math.min(count, sorted.length)).map((s) => s.participantId)
}

/**
 * Calculate optimal bracket size (power of 2).
 * For example: 3-4 teams → 4-team bracket, 5-8 → 8-team bracket.
 */
export function getOptimalBracketSize(participantCount: number): number {
  if (participantCount < 2) return 2
  if (participantCount <= 2) return 2
  if (participantCount <= 4) return 4
  if (participantCount <= 8) return 8
  if (participantCount <= 16) return 16
  if (participantCount <= 32) return 32
  return 64 // Cap at 64-team bracket
}

/**
 * Add byes to bracket if participant count doesn't match bracket size.
 */
export function addByesToBracket(
  qualifiedParticipants: string[],
  bracketSize: number
): string[] {
  if (qualifiedParticipants.length >= bracketSize) {
    return qualifiedParticipants.slice(0, bracketSize)
  }

  // Add byes (null participants) to fill bracket
  const withByes = [...qualifiedParticipants]
  const byeCount = bracketSize - qualifiedParticipants.length

  for (let i = 0; i < byeCount; i++) {
    withByes.push(`bye_${i}`)
  }

  return withByes
}

/**
 * Count total matches needed for bracket of given size.
 * Single elimination: n-1 matches for n participants.
 */
export function countBracketMatches(participantCount: number): number {
  return Math.max(0, participantCount - 1)
}
