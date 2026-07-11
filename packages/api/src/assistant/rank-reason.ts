/**
 * buildRankReason — per-row explanation of a group's standings order (T1.2).
 *
 * Pure function over already-loaded standings rows: it explains the ordering
 * @core's calculateStandings already produced (wins → sets won → head-to-head
 * → coin flip, HL §4.3) and introduces NO new ranking logic. The model only
 * verbalizes these strings — the Haiku quality mitigation from the design (§6).
 *
 * Mirrors compareStandings exactly, including its rule that head-to-head is
 * only consulted for 2-participant standings.
 */

export interface RankReasonRow {
  participantId: string
  name: string
  rank: number
  wins: number
  setsWon: number
}

/**
 * headToHead: key "aId|bId" → number of direct wins of a over b.
 * Returns one reason string per row, aligned with the input order (which must
 * already be rank order).
 */
export function buildRankReason(rows: RankReasonRow[], headToHead: Map<string, number>): string[] {
  if (rows.length === 0) return []
  if (rows.length === 1) return ['only player in the group']

  // Each row is explained against its adjacent row: the leader against the row
  // below it, everyone else against the row directly above them.
  return rows.map((row, i) => {
    const other = i === 0 ? rows[1] : rows[i - 1]
    const ahead = i === 0
    return reasonAgainst(row, other, ahead, rows.length, headToHead)
  })
}

function reasonAgainst(
  row: RankReasonRow,
  other: RankReasonRow,
  ahead: boolean,
  groupSize: number,
  headToHead: Map<string, number>
): string {
  if (row.wins !== other.wins) {
    return ahead
      ? `more wins than ${other.name} (${row.wins} vs ${other.wins})`
      : `fewer wins than ${other.name} (${row.wins} vs ${other.wins})`
  }

  if (row.setsWon !== other.setsWon) {
    return ahead
      ? `equal wins with ${other.name}, more sets won (${row.setsWon} vs ${other.setsWon})`
      : `equal wins with ${other.name}, fewer sets won (${row.setsWon} vs ${other.setsWon})`
  }

  // Head-to-head only applies to 2-participant standings (compareStandings)
  if (groupSize === 2) {
    const rowWins = headToHead.get(`${row.participantId}|${other.participantId}`) ?? 0
    const otherWins = headToHead.get(`${other.participantId}|${row.participantId}`) ?? 0
    if (rowWins !== otherWins) {
      return ahead
        ? `equal wins and sets with ${other.name}; won head-to-head`
        : `equal wins and sets with ${other.name}; lost head-to-head`
    }
  }

  return `equal wins and sets with ${other.name}, no head-to-head decider — order decided by coin flip`
}
