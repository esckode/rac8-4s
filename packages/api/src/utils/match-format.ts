import { getLogger } from '../logger'

const log = getLogger('match-format')

export type MatchFormat = 'singles' | 'doubles'

export interface FormattedMatch {
  format?: MatchFormat | string | null
  player1_id?: string
  player2_id?: string
  team1_id?: string
  team2_id?: string
  [key: string]: any
}

/**
 * Get the format of a match from the database record.
 * Throws if format is invalid or missing.
 */
export function getMatchFormat(match: any): MatchFormat {
  if (!match || typeof match.format !== 'string') {
    throw new Error('Match format required')
  }

  const format = match.format.toLowerCase()
  if (!['singles', 'doubles'].includes(format)) {
    throw new Error(`Invalid match format: ${format}`)
  }

  return format as MatchFormat
}

/**
 * Check if a match is a singles match.
 */
export function isSinglesMatch(match: any): boolean {
  try {
    return getMatchFormat(match) === 'singles'
  } catch {
    return false
  }
}

/**
 * Check if a match is a doubles match.
 */
export function isDoublesMatch(match: any): boolean {
  try {
    return getMatchFormat(match) === 'doubles'
  } catch {
    return false
  }
}

/**
 * Get participant IDs from a match based on format.
 * Returns [participant1_id, participant2_id]
 */
export function getMatchParticipantIds(match: any): string[] {
  const format = getMatchFormat(match)

  if (format === 'singles') {
    if (!match.player1_id || !match.player2_id) {
      throw new Error('Singles match missing player IDs')
    }
    return [match.player1_id, match.player2_id]
  }

  if (format === 'doubles') {
    if (!match.team1_id || !match.team2_id) {
      throw new Error('Doubles match missing team IDs')
    }
    return [match.team1_id, match.team2_id]
  }

  throw new Error('Unknown match format')
}

/**
 * Validate that match format matches the data present.
 * Throws if format='singles' but only team IDs present, etc.
 */
export function validateMatchFormatConsistency(match: any): void {
  const format = getMatchFormat(match)

  if (format === 'singles') {
    if ((!match.player1_id || !match.player2_id) && (match.team1_id || match.team2_id)) {
      throw new Error('Format mismatch: format=singles but team IDs present')
    }
  } else if (format === 'doubles') {
    if ((!match.team1_id || !match.team2_id) && (match.player1_id || match.player2_id)) {
      throw new Error('Format mismatch: format=doubles but player IDs present')
    }
  }
}

/**
 * Get the participant type based on match format.
 */
export function getParticipantType(match: any): 'player' | 'team' {
  return isSinglesMatch(match) ? 'player' : 'team'
}
