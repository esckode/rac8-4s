import type { Player, Standing } from '@shared/types'

/**
 * Extract {id, name} participant records from a tournament bundle's standings so
 * they can seed the playerCache (which MatchCard / StandingsTable / BracketTree
 * read for display names). The bundle returns standings grouped per group
 * (`[{ standings: [{ playerId, name }] }]`); older/mocked callers may pass a flat
 * `Standing[]` with `participantId`. Both shapes are handled. For doubles the
 * participant id is a team id and the name is the team name.
 */
export function playersFromBundleStandings(standings: unknown): Player[] {
  if (!Array.isArray(standings)) return []

  const rows: any[] = standings.flatMap((entry: any) =>
    Array.isArray(entry?.standings) ? entry.standings : [entry]
  )

  const players: Player[] = []
  for (const row of rows) {
    const id = row?.playerId ?? row?.participantId
    const name = row?.name
    if (id && name) players.push({ id, name } as Player)
  }
  return players
}

/**
 * Flatten a tournament bundle's standings into the flat `Standing[]` that
 * StandingsTable consumes. The bundle returns standings grouped per group
 * (`[{ standings: [{ playerId, ... }] }]`); mocked/older callers may pass a flat
 * array using `participantId` or `playerId`. All shapes are normalised to
 * `{ participantId, rank, wins, losses, setsWon, setsLost }`.
 */
export function flattenBundleStandings(standings: unknown): Standing[] {
  if (!Array.isArray(standings)) return []

  const rows: any[] = standings.flatMap((entry: any) =>
    Array.isArray(entry?.standings) ? entry.standings : [entry]
  )

  return rows.map((row: any) => ({
    participantId: row?.participantId ?? row?.playerId,
    rank: row?.rank,
    wins: row?.wins,
    losses: row?.losses,
    setsWon: row?.setsWon,
    setsLost: row?.setsLost,
  }))
}
