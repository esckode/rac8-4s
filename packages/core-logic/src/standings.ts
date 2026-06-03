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

export function calculateStandings(participants: Participant[], matches: Match[]): Standing[] {
  const stats = new Map<string, StandingStats>()

  // Initialize stats for all participants (works for any ID type)
  participants.forEach(participant => {
    stats.set(participant.id, {
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      headToHead: new Map(),
    })
  })

  // Process matches
  matches.forEach(match => {
    const participant1Stats = stats.get(match.participant1Id)
    const participant2Stats = stats.get(match.participant2Id)

    if (!participant1Stats || !participant2Stats) return

    if (!match.winnerId) {
      return
    }

    // Count sets from score
    const sets = match.score ? parseSets(match.score) : { setsWon: 1, setsLost: 0 }

    if (match.winnerId === match.participant1Id) {
      participant1Stats.wins++
      participant2Stats.losses++
      participant1Stats.setsWon += sets.setsWon
      participant2Stats.setsLost += sets.setsWon
      participant2Stats.setsWon += sets.setsLost
      participant1Stats.setsLost += sets.setsLost

      // Track head-to-head
      participant1Stats.headToHead.set(
        match.participant2Id,
        (participant1Stats.headToHead.get(match.participant2Id) ?? 0) + 1
      )
    } else {
      participant2Stats.wins++
      participant1Stats.losses++
      participant2Stats.setsWon += sets.setsWon
      participant1Stats.setsLost += sets.setsWon
      participant1Stats.setsWon += sets.setsLost
      participant2Stats.setsLost += sets.setsLost

      // Track head-to-head
      participant2Stats.headToHead.set(
        match.participant1Id,
        (participant2Stats.headToHead.get(match.participant1Id) ?? 0) + 1
      )
    }
  })

  // Convert to standings and sort
  const standings: Standing[] = participants.map(participant => {
    const stat = stats.get(participant.id)!
    return {
      participantId: participant.id,
      rank: 0,
      wins: stat.wins,
      losses: stat.losses,
      setsWon: stat.setsWon,
      setsLost: stat.setsLost,
    }
  })

  // Sort by: wins (desc), sets won (desc), head-to-head, then random
  standings.sort((a, b) => {
    // Primary: wins
    if (a.wins !== b.wins) return b.wins - a.wins

    // Tiebreaker 1: sets won
    if (a.setsWon !== b.setsWon) return b.setsWon - a.setsWon

    // Tiebreaker 2: head-to-head (for direct matchups only if 2 participants)
    if (standings.length === 2) {
      const aStats = stats.get(a.participantId)!
      const bStats = stats.get(b.participantId)!
      const aHeadToHead = aStats.headToHead.get(b.participantId) ?? 0
      const bHeadToHead = bStats.headToHead.get(a.participantId) ?? 0
      if (aHeadToHead !== bHeadToHead) return bHeadToHead - aHeadToHead
    }

    // Tiebreaker 3: random (deterministic within same seed for testing)
    return Math.random() - 0.5
  })

  // Assign ranks
  standings.forEach((standing, index) => {
    standing.rank = index + 1
  })

  return standings
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
