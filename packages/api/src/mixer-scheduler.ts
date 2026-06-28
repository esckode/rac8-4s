export type PriorPairing = { playerA: string; playerB: string }
export type DoublesMatch = { team1: string[]; team2: string[] }
export type RoundResult = { matches: DoublesMatch[]; sitOut: string | null }

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateRoundPairings(
  players: string[],
  round: number,
  priorPairings: PriorPairing[],
  seed: number,
  priorSitOuts?: string[]
): RoundResult {
  const rng = mulberry32(seed ^ (round * 0x9e3779b9))

  // Build prior-pair set (normalised)
  const priorPairSet = new Set<string>()
  for (const p of priorPairings) {
    priorPairSet.add([p.playerA, p.playerB].sort().join('|'))
  }

  // Determine sit-out for odd N
  let sitOut: string | null = null
  let active = players.slice()

  if (players.length % 2 === 1) {
    // Count sit-out appearances per player
    const sitOutCounts = new Map<string, number>()
    for (const p of players) sitOutCounts.set(p, 0)
    for (const s of priorSitOuts ?? []) {
      sitOutCounts.set(s, (sitOutCounts.get(s) ?? 0) + 1)
    }
    const minCount = Math.min(...players.map(p => sitOutCounts.get(p)!))
    const candidates = players.filter(p => sitOutCounts.get(p) === minCount)
    // Break ties by RNG
    const shuffledCandidates = shuffle(candidates, rng)
    sitOut = shuffledCandidates[0]
    active = players.filter(p => p !== sitOut)
  }

  // Shuffle active players with seeded RNG (Fisher-Yates)
  const shuffled = shuffle(active, rng)

  // Greedily pair consecutive players, avoiding prior pairs where possible
  const matches: DoublesMatch[] = []
  const used = new Set<string>()

  for (let i = 0; i < shuffled.length; i++) {
    if (used.has(shuffled[i])) continue
    const playerA = shuffled[i]

    // Find best partner: first unpaired player not a prior opponent
    let partner: string | null = null
    for (let j = i + 1; j < shuffled.length; j++) {
      if (used.has(shuffled[j])) continue
      const key = [playerA, shuffled[j]].sort().join('|')
      if (!priorPairSet.has(key)) {
        partner = shuffled[j]
        break
      }
    }

    // If no novel partner found, accept first available (best-effort)
    if (partner === null) {
      for (let j = i + 1; j < shuffled.length; j++) {
        if (!used.has(shuffled[j])) {
          partner = shuffled[j]
          break
        }
      }
    }

    if (partner !== null) {
      matches.push({ team1: [playerA], team2: [partner] })
      used.add(playerA)
      used.add(partner)
    }
  }

  return { matches, sitOut }
}
