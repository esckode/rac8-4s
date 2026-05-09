export type SportFormat = 'tennis' | 'pickleball' | 'badminton' | 'table_tennis'

export interface ParsedSet {
  player1: number
  player2: number
}

export interface ParsedScore {
  sets: ParsedSet[]
  winner: 'player1' | 'player2'
  valid: boolean
}

const MAX_GAME_SCORE: Record<SportFormat, number> = {
  tennis: 7,
  pickleball: 21,
  badminton: 30,
  table_tennis: 21,
}

const FORMAT_REGEX = /^\d+-\d+(, \d+-\d+)*$/

export function parseScore(score: string, format: SportFormat = 'tennis'): ParsedScore {
  validateFormat(score)
  const setStrings = score.split(', ')
  const sets = setStrings.map((setStr, idx) => parseSet(setStr, idx))
  validateSets(sets, format)
  const winner = determineWinner(sets)

  return {
    sets,
    winner,
    valid: true,
  }
}

function validateFormat(score: string): void {
  if (!score) {
    throw new Error("Invalid score format: expected 'X-Y, X-Y' (comma-space separated sets)")
  }

  // Check for leading dash (indicates negative number)
  if (/^-/.test(score)) {
    throw new Error("Invalid score format: game scores cannot be negative")
  }

  // Check for letters (non-numeric)
  if (/[a-zA-Z]/.test(score)) {
    throw new Error("Invalid score format: game scores must be numeric")
  }

  // Check for negative numbers in sets (comma-space then dash)
  if (/,\s*-/.test(score)) {
    throw new Error("Invalid score format: game scores cannot be negative")
  }

  // General format check
  if (!FORMAT_REGEX.test(score)) {
    throw new Error("Invalid score format: expected 'X-Y, X-Y' (comma-space separated sets)")
  }
}

function parseSet(setStr: string, index: number): ParsedSet {
  const parts = setStr.split('-')
  if (parts.length !== 2) {
    throw new Error(`Invalid set ${index + 1}: expected format 'X-Y'`)
  }

  const player1 = parseInt(parts[0], 10)
  const player2 = parseInt(parts[1], 10)

  if (isNaN(player1) || isNaN(player2)) {
    throw new Error(`Invalid set ${index + 1}: game scores must be numeric`)
  }

  if (player1 < 0 || player2 < 0) {
    throw new Error(`Invalid set ${index + 1}: game scores cannot be negative`)
  }

  return { player1, player2 }
}

function validateSets(sets: ParsedSet[], format: SportFormat): void {
  const maxScore = MAX_GAME_SCORE[format]

  sets.forEach((set, idx) => {
    // Check for tied set
    if (set.player1 === set.player2) {
      throw new Error(`Invalid set ${idx + 1}: tied sets are not allowed`)
    }

    // Check max game score for format
    if (set.player1 > maxScore || set.player2 > maxScore) {
      throw new Error(
        `Invalid set ${idx + 1}: game score exceeds maximum of ${maxScore} for ${format} format`
      )
    }
  })

  // Validate match completion (best-of-3)
  validateMatchCompletion(sets)
}

function validateMatchCompletion(sets: ParsedSet[]): void {
  if (sets.length === 0) {
    throw new Error('No sets provided')
  }

  let player1Wins = 0
  let player2Wins = 0

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]

    if (set.player1 > set.player2) {
      player1Wins++
    } else {
      player2Wins++
    }

    // Check if match is already decided before this set
    if ((player1Wins === 2 || player2Wins === 2) && i < sets.length - 1) {
      throw new Error('Invalid score: match was already decided before the last set')
    }
  }

  // Check if match is complete (one player has 2 wins)
  if (player1Wins !== 2 && player2Wins !== 2) {
    throw new Error('Invalid score: match is not complete (neither player won required sets)')
  }
}

function determineWinner(sets: ParsedSet[]): 'player1' | 'player2' {
  let player1Wins = 0
  let player2Wins = 0

  for (const set of sets) {
    if (set.player1 > set.player2) {
      player1Wins++
    } else {
      player2Wins++
    }
  }

  return player1Wins > player2Wins ? 'player1' : 'player2'
}
