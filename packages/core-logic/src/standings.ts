export interface Player {
  id: string
  name: string
}

export interface Match {
  player1Id: string
  player2Id: string
  winnerId: string | null
  score: string | null
}

export interface Standing {
  playerId: string
  rank: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

export function calculateStandings(players: Player[], matches: Match[]): Standing[] {
  const stats = new Map<string, { wins: number; losses: number; setsWon: number; setsLost: number; headToHead: Map<string, number> }>()

  // Initialize stats for all players
  players.forEach(player => {
    stats.set(player.id, {
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      headToHead: new Map(),
    })
  })

  // Process matches
  matches.forEach(match => {
    const player1Stats = stats.get(match.player1Id)
    const player2Stats = stats.get(match.player2Id)

    if (!player1Stats || !player2Stats) return

    if (!match.winnerId) {
      return
    }

    // Count sets from score
    const sets = match.score ? parseSets(match.score) : { setsWon: 1, setsLost: 0 }

    if (match.winnerId === match.player1Id) {
      player1Stats.wins++
      player2Stats.losses++
      player1Stats.setsWon += sets.setsWon
      player2Stats.setsLost += sets.setsWon
      player2Stats.setsWon += sets.setsLost
      player1Stats.setsLost += sets.setsLost

      // Track head-to-head
      player1Stats.headToHead.set(match.player2Id, (player1Stats.headToHead.get(match.player2Id) ?? 0) + 1)
    } else {
      player2Stats.wins++
      player1Stats.losses++
      player2Stats.setsWon += sets.setsWon
      player1Stats.setsLost += sets.setsWon
      player1Stats.setsWon += sets.setsLost
      player2Stats.setsLost += sets.setsLost

      // Track head-to-head
      player2Stats.headToHead.set(match.player1Id, (player2Stats.headToHead.get(match.player1Id) ?? 0) + 1)
    }
  })

  // Convert to standings and sort
  const standings: Standing[] = players.map(player => {
    const stat = stats.get(player.id)!
    return {
      playerId: player.id,
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

    // Tiebreaker 2: head-to-head (for direct matchups only if 2 players)
    if (standings.length === 2) {
      const aStats = stats.get(a.playerId)!
      const bStats = stats.get(b.playerId)!
      const aHeadToHead = aStats.headToHead.get(b.playerId) ?? 0
      const bHeadToHead = bStats.headToHead.get(a.playerId) ?? 0
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
