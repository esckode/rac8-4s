export interface BracketMatch {
  id: string
  round: number
  position: number
  player1: string | null
  player2: string | null
  input1MatchId: string | null
  input2MatchId: string | null
}

export interface BracketRound {
  round: number
  matches: BracketMatch[]
}

export interface Bracket {
  totalMatches: number
  byeCount: number
  byeRecipients: string[]
  rounds: BracketRound[]
}

export function generateBracket(playerCount: number): Bracket {
  const bracketSize = nextPow2(playerCount)
  const byeCount = bracketSize - playerCount
  const totalMatches = bracketSize - 1

  // Generate seeding order for round 1
  const seedOrder = getSeedingOrder(bracketSize)

  // Collect all matches across all rounds
  const allMatches: BracketMatch[][] = []

  // Create round 1 matches
  const round1Matches: BracketMatch[] = []
  const byeRecipients: string[] = []

  for (let i = 0; i < seedOrder.length; i += 2) {
    const seed1 = seedOrder[i]
    const seed2 = seedOrder[i + 1]
    const player1 = `seed_${seed1}`
    const player2 = seed2 <= playerCount ? `seed_${seed2}` : null

    // Seed1 is always <= playerCount; seed2 is null if it exceeds playerCount (bye case)
    if (player2 === null) {
      byeRecipients.push(player1)
    }

    round1Matches.push({
      id: `match-r1-${i / 2 + 1}`,
      round: 1,
      position: i / 2 + 1,
      player1,
      player2,
      input1MatchId: null,
      input2MatchId: null,
    })
  }

  allMatches.push(round1Matches)

  // Create subsequent rounds
  let currentRoundMatches = round1Matches
  let roundNum = 2

  while (currentRoundMatches.length > 1) {
    const nextRoundMatches: BracketMatch[] = []

    for (let i = 0; i < currentRoundMatches.length; i += 2) {
      nextRoundMatches.push({
        id: `match-r${roundNum}-${i / 2 + 1}`,
        round: roundNum,
        position: i / 2 + 1,
        player1: null,
        player2: null,
        input1MatchId: currentRoundMatches[i].id,
        input2MatchId: currentRoundMatches[i + 1].id,
      })
    }

    allMatches.push(nextRoundMatches)
    currentRoundMatches = nextRoundMatches
    roundNum++
  }

  // Sort byeRecipients by seed number
  byeRecipients.sort((a, b) => {
    const aNum = parseInt(a.replace('seed_', ''), 10)
    const bNum = parseInt(b.replace('seed_', ''), 10)
    return aNum - bNum
  })

  return {
    totalMatches,
    byeCount,
    byeRecipients,
    rounds: allMatches.map((matches, idx) => ({
      round: idx + 1,
      matches,
    })),
  }
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) {
    p *= 2
  }
  return p
}

function getSeedingOrder(size: number): number[] {
  if (size === 1) {
    return [1]
  }

  const half = getSeedingOrder(size / 2)
  const result: number[] = []

  for (const seed of half) {
    result.push(seed)
    result.push(size + 1 - seed)
  }

  return result
}
