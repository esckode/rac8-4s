import { parseScore, ParsedScore } from '../index'

describe('Score Parsing', () => {
  describe('Format Validation', () => {
    it('parses valid two-set score correctly', () => {
      const result = parseScore('6-4, 6-3')
      expect(result.sets).toEqual([
        { player1: 6, player2: 4 },
        { player1: 6, player2: 3 },
      ])
      expect(result.winner).toBe('player1')
      expect(result.valid).toBe(true)
    })

    it('parses valid three-set score correctly', () => {
      const result = parseScore('6-4, 3-6, 6-2')
      expect(result.sets).toEqual([
        { player1: 6, player2: 4 },
        { player1: 3, player2: 6 },
        { player1: 6, player2: 2 },
      ])
      expect(result.winner).toBe('player1')
      expect(result.valid).toBe(true)
    })

    it('throws for missing comma between sets', () => {
      expect(() => parseScore('6-4 6-3')).toThrow()
    })

    it('throws for missing space after comma', () => {
      expect(() => parseScore('6-4,6-3')).toThrow()
    })

    it('throws for incomplete set (no Y value)', () => {
      expect(() => parseScore('6-4, 6')).toThrow()
    })

    it('throws for non-numeric game score', () => {
      expect(() => parseScore('six-4, 6-3')).toThrow()
    })

    it('throws for empty string', () => {
      expect(() => parseScore('')).toThrow()
    })

    it('throws for just a single set with no comma', () => {
      expect(() => parseScore('6-4')).toThrow()
    })

    it('throws for leading/trailing spaces in set', () => {
      expect(() => parseScore(' 6-4, 6-3')).toThrow()
    })

    it('throws for multiple spaces after comma', () => {
      expect(() => parseScore('6-4,  6-3')).toThrow()
    })
  })

  describe('Match Completion', () => {
    it('player 1 wins 2-0 in two sets', () => {
      const result = parseScore('6-4, 6-3')
      expect(result.winner).toBe('player1')
      expect(result.sets).toHaveLength(2)
    })

    it('player 2 wins 2-0 in two sets', () => {
      const result = parseScore('4-6, 3-6')
      expect(result.winner).toBe('player2')
      expect(result.sets).toHaveLength(2)
    })

    it('player 1 wins in three sets (2-1)', () => {
      const result = parseScore('6-4, 3-6, 6-2')
      expect(result.winner).toBe('player1')
      expect(result.sets).toHaveLength(3)
    })

    it('player 2 wins in three sets (2-1)', () => {
      const result = parseScore('4-6, 6-3, 3-6')
      expect(result.winner).toBe('player2')
      expect(result.sets).toHaveLength(3)
    })

    it('throws when match not finished after sets provided', () => {
      expect(() => parseScore('6-4, 3-6')).toThrow()
    })

    it('throws when match was decided but extra set given', () => {
      expect(() => parseScore('6-4, 6-3, 6-2')).toThrow()
    })

    it('throws when single set provided (match incomplete)', () => {
      expect(() => parseScore('6-4, 6-3, 4-6, 5-1')).toThrow()
    })
  })

  describe('Tennis Format (default)', () => {
    it('accepts tiebreak set 7-6', () => {
      const result = parseScore('7-6, 6-3')
      expect(result.valid).toBe(true)
      expect(result.winner).toBe('player1')
    })

    it('accepts mixed set scores like 7-5', () => {
      const result = parseScore('7-5, 6-4')
      expect(result.valid).toBe(true)
    })

    it('throws for game score above tennis maximum (7)', () => {
      expect(() => parseScore('6-4, 10-3')).toThrow()
    })

    it('throws for tied set', () => {
      expect(() => parseScore('6-6, 6-3')).toThrow()
    })

    it('throws for both sets tied', () => {
      expect(() => parseScore('6-6, 4-4')).toThrow()
    })

    it('accepts set scores where player1 loses first set', () => {
      const result = parseScore('4-6, 6-3, 6-2')
      expect(result.winner).toBe('player1')
    })
  })

  describe('Pickleball Format', () => {
    it('accepts pickleball scores of 11-9', () => {
      const result = parseScore('11-9, 11-7', 'pickleball')
      expect(result.valid).toBe(true)
    })

    it('accepts pickleball scores with both sets 11+', () => {
      const result = parseScore('11-9, 11-7', 'pickleball')
      expect(result.sets[0]).toEqual({ player1: 11, player2: 9 })
      expect(result.sets[1]).toEqual({ player1: 11, player2: 7 })
    })

    it('throws for pickleball score above maximum', () => {
      expect(() => parseScore('25-4, 11-9', 'pickleball')).toThrow()
    })

    it('accepts tied games below maximum (wins on set count, not game count)', () => {
      const result = parseScore('12-10, 11-8', 'pickleball')
      expect(result.valid).toBe(true)
    })
  })

  describe('Badminton Format', () => {
    it('accepts badminton set scores up to 30', () => {
      const result = parseScore('21-18, 21-15', 'badminton')
      expect(result.valid).toBe(true)
    })

    it('accepts high badminton scores', () => {
      const result = parseScore('25-23, 21-19', 'badminton')
      expect(result.valid).toBe(true)
    })

    it('throws for badminton score above maximum (30)', () => {
      expect(() => parseScore('31-20, 21-18', 'badminton')).toThrow()
    })
  })

  describe('Table Tennis Format', () => {
    it('accepts table tennis scores', () => {
      const result = parseScore('11-8, 11-6', 'table_tennis')
      expect(result.valid).toBe(true)
    })

    it('accepts close table tennis scores', () => {
      const result = parseScore('12-10, 11-9', 'table_tennis')
      expect(result.valid).toBe(true)
    })

    it('throws for table tennis score above maximum (21)', () => {
      expect(() => parseScore('11-8, 25-9', 'table_tennis')).toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('returns valid: true on successful parse', () => {
      const result = parseScore('6-4, 6-3')
      expect(result.valid).toBe(true)
    })

    it('handles zero scores', () => {
      const result = parseScore('6-0, 6-0')
      expect(result.valid).toBe(true)
      expect(result.winner).toBe('player1')
    })

    it('parses single digit scores correctly', () => {
      const result = parseScore('1-0, 1-0')
      expect(result.valid).toBe(true)
    })

    it('parses large score numbers correctly', () => {
      const result = parseScore('20-19, 21-19', 'badminton')
      expect(result.valid).toBe(true)
    })

    it('all sets array matches order provided', () => {
      const result = parseScore('6-4, 3-6, 6-2')
      expect(result.sets[0].player1).toBe(6)
      expect(result.sets[1].player2).toBe(6)
      expect(result.sets[2].player1).toBe(6)
    })

    it('throws for negative score', () => {
      expect(() => parseScore('-1-4, 6-3')).toThrow()
    })

    it('throws for decimal score', () => {
      expect(() => parseScore('6.5-4, 6-3')).toThrow()
    })

    it('throws for excessive sets in match', () => {
      // Best of 3, so max 3 sets. Providing 4 is an error.
      expect(() => parseScore('6-4, 3-6, 4-6, 6-2')).toThrow()
    })
  })

  describe('Error Messages', () => {
    it('error includes helpful format hint', () => {
      expect(() => parseScore('6-4 6-3')).toThrow(
        /expected 'X-Y, X-Y'/
      )
    })

    it('error thrown on non-numeric values includes context', () => {
      expect(() => parseScore('a-4, 6-3')).toThrow(
        /numeric/
      )
    })

    it('error on tied set is descriptive', () => {
      expect(() => parseScore('6-6, 6-3')).toThrow(
        /tied sets are not allowed/
      )
    })

    it('error on incomplete match is descriptive', () => {
      expect(() => parseScore('6-4, 3-6')).toThrow(
        /neither player won required sets/
      )
    })

    it('error on exceeded game score is clear', () => {
      expect(() => parseScore('6-4, 10-3')).toThrow(
        /exceeds maximum/
      )
    })

    it('error on negative score is clear', () => {
      expect(() => parseScore('-1-4, 6-3')).toThrow(
        /cannot be negative/
      )
    })

    it('error on extra sets after match decided is clear', () => {
      expect(() => parseScore('6-4, 6-3, 6-2')).toThrow(
        /already decided/
      )
    })
  })

  describe('Winner Determination', () => {
    it('correctly identifies player 1 as winner when leading 1-0 in sets', () => {
      const result = parseScore('6-4, 3-6, 6-2')
      expect(result.winner).toBe('player1')
    })

    it('correctly identifies player 2 as winner when player 2 takes 2 sets', () => {
      const result = parseScore('4-6, 6-3, 3-6')
      expect(result.winner).toBe('player2')
    })

    it('winner is determined after minimum 2 sets', () => {
      const result = parseScore('6-4, 6-3')
      expect(result.sets).toHaveLength(2)
      expect(result.winner).toBe('player1')
    })

    it('winner is determined based on set wins, not game wins', () => {
      const result = parseScore('6-4, 3-6, 6-2')
      // player1 wins 2 sets (6-4, 6-2) despite losing 3-6
      expect(result.winner).toBe('player1')
    })
  })

  describe('Format Parameter Behavior', () => {
    it('defaults to tennis format when no format specified', () => {
      expect(() => parseScore('6-4, 10-3')).toThrow()
    })

    it('accepts pickleball when format parameter is pickleball', () => {
      const result = parseScore('11-9, 11-7', 'pickleball')
      expect(result.valid).toBe(true)
    })

    it('accepts badminton when format parameter is badminton', () => {
      const result = parseScore('21-18, 21-15', 'badminton')
      expect(result.valid).toBe(true)
    })

    it('accepts table_tennis when format parameter is table_tennis', () => {
      const result = parseScore('11-8, 11-6', 'table_tennis')
      expect(result.valid).toBe(true)
    })
  })
})
