/**
 * Recap template (Phase C / T3.3 — design §11 C-Q9/C-Q10).
 *
 * Template-first: winner, top-3 standings, one stat — computed from existing
 * standings repo data (rank_reason philosophy: precompute server-side, the
 * model only ever verbalizes or polishes). LLM polish (recap-processor.ts)
 * rewrites this text; on any polish failure the template posts unchanged.
 */

export interface RecapStanding {
  rank: number
  name: string
  wins: number
  losses: number
}

/** Pure template — recap ≤80 words (Q16 addendum). */
export function buildRecap(tournamentName: string, standings: RecapStanding[], completedMatchCount: number): string {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank)
  const winner = sorted[0]
  const top3 = sorted.slice(0, 3)
  const standingsLine = top3.map(s => `${s.rank}. ${s.name}`).join(', ')
  const winnerClause = winner ? `${winner.name} takes the win` : 'results are in'

  return `${tournamentName} wrapped up — ${winnerClause}. Final standings: ${standingsLine}. ${completedMatchCount} matches played.`
}
