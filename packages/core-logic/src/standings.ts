export interface Participant {
  id: string
  name?: string
}

export interface Player extends Participant {
  name: string
}

export interface Match {
  participant1Id: string
  participant2Id: string
  winnerId: string | null
  score: string | null
}

export interface Standing {
  participantId: string
  rank: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

interface StandingStats {
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  headToHead: Map<string, number>
}

/**
 * Calculate standings from participants and match results.
 * Generic over participant type (players, teams, etc.) - only cares about IDs.
 *
 * Ranking order:
 * 1. Wins (descending)
 * 2. Sets won (descending)
 * 3. Head-to-head record (for 2-participant ties only)
 * 4. Random (for unbreakable ties)
 */
export function calculateStandings(participants: Participant[], matches: Match[]): Standing[] {
  const stats = initializeStats(participants)
  processMatches(matches, stats)
  const standings = createStandings(participants, stats)
  rankStandings(standings, stats)
  return standings
}

function initializeStats(participants: Participant[]): Map<string, StandingStats> {
  const stats = new Map<string, StandingStats>()
  participants.forEach(participant => {
    stats.set(participant.id, {
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      headToHead: new Map(),
    })
  })
  return stats
}

function processMatches(matches: Match[], stats: Map<string, StandingStats>): void {
  matches.forEach(match => {
    const p1Stats = stats.get(match.participant1Id)
    const p2Stats = stats.get(match.participant2Id)

    // Skip invalid matches (participants not in stats, or no winner)
    if (!p1Stats || !p2Stats || !match.winnerId) return

    const sets = match.score ? parseSets(match.score) : { setsWon: 1, setsLost: 0 }
    const participant1Won = match.winnerId === match.participant1Id

    // Update match records and sets
    if (participant1Won) {
      p1Stats.wins++
      p2Stats.losses++
    } else {
      p2Stats.wins++
      p1Stats.losses++
    }

    // Update set counts
    p1Stats.setsWon += participant1Won ? sets.setsWon : sets.setsLost
    p1Stats.setsLost += participant1Won ? sets.setsLost : sets.setsWon
    p2Stats.setsWon += participant1Won ? sets.setsLost : sets.setsWon
    p2Stats.setsLost += participant1Won ? sets.setsWon : sets.setsLost

    // Track head-to-head
    if (participant1Won) {
      p1Stats.headToHead.set(match.participant2Id, (p1Stats.headToHead.get(match.participant2Id) ?? 0) + 1)
    } else {
      p2Stats.headToHead.set(match.participant1Id, (p2Stats.headToHead.get(match.participant1Id) ?? 0) + 1)
    }
  })
}

function createStandings(participants: Participant[], stats: Map<string, StandingStats>): Standing[] {
  return participants.map(participant => {
    const stat = stats.get(participant.id)!
    return {
      participantId: participant.id,
      rank: 0, // Will be assigned in rankStandings
      wins: stat.wins,
      losses: stat.losses,
      setsWon: stat.setsWon,
      setsLost: stat.setsLost,
    }
  })
}

function rankStandings(standings: Standing[], stats: Map<string, StandingStats>): void {
  standings.sort((a, b) => compareStandings(a, b, standings, stats))
  standings.forEach((standing, index) => {
    standing.rank = index + 1
  })
}

function compareStandings(
  a: Standing,
  b: Standing,
  allStandings: Standing[],
  stats: Map<string, StandingStats>
): number {
  // Primary tiebreaker: wins
  if (a.wins !== b.wins) return b.wins - a.wins

  // Tiebreaker 1: sets won
  if (a.setsWon !== b.setsWon) return b.setsWon - a.setsWon

  // Tiebreaker 2: head-to-head (only applies for direct 2-participant matchups)
  if (allStandings.length === 2) {
    const aHeadToHead = stats.get(a.participantId)?.headToHead.get(b.participantId) ?? 0
    const bHeadToHead = stats.get(b.participantId)?.headToHead.get(a.participantId) ?? 0
    if (aHeadToHead !== bHeadToHead) return bHeadToHead - aHeadToHead
  }

  // Tiebreaker 3: random for unbreakable ties
  return Math.random() - 0.5
}

function parseSets(score: string): { setsWon: number; setsLost: number } {
  const sets = score.split(',').map(set => {
    const games = set.trim().split('-').map(Number)
    return { player1Games: games[0], player2Games: games[1] }
  })

  let setsWon = 0
  let setsLost = 0

  sets.forEach(set => {
    if (set.player1Games > set.player2Games) {
      setsWon++
    } else if (set.player2Games > set.player1Games) {
      setsLost++
    }
  })

  return { setsWon, setsLost }
}
