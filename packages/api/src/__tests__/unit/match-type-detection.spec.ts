/**
 * @jest/globals has been imported at the top to make sure we use Jest's test runner
 * These are pure unit tests that don't require a database
 */
describe('Match Type Detection (Format Column)', () => {
  let getMatchFormat: any
  let isSinglesMatch: any
  let isDoublesMatch: any
  let getMatchParticipantIds: any
  let validateMatchFormatConsistency: any
  let getParticipantType: any

  beforeAll(async () => {
    // Dynamically import the module to avoid triggering database setup
    const module = await import('../../utils/match-format')
    getMatchFormat = module.getMatchFormat
    isSinglesMatch = module.isSinglesMatch
    isDoublesMatch = module.isDoublesMatch
    getMatchParticipantIds = module.getMatchParticipantIds
    validateMatchFormatConsistency = module.validateMatchFormatConsistency
    getParticipantType = module.getParticipantType
  })

  describe('getMatchFormat()', () => {
    it('should return singles for format=singles', () => {
      const match = { format: 'singles', player1_id: 'p1', player2_id: 'p2' }
      expect(getMatchFormat(match)).toBe('singles')
    })

    it('should return doubles for format=doubles', () => {
      const match = { format: 'doubles', team1_id: 't1', team2_id: 't2' }
      expect(getMatchFormat(match)).toBe('doubles')
    })

    it('should handle uppercase format values', () => {
      const match = { format: 'SINGLES', player1_id: 'p1', player2_id: 'p2' }
      expect(getMatchFormat(match)).toBe('singles')
    })

    it('should throw for invalid format', () => {
      const match = { format: 'invalid' }
      expect(() => getMatchFormat(match)).toThrow(/invalid|Invalid/)
    })

    it('should throw for NULL format', () => {
      const match = { format: null }
      expect(() => getMatchFormat(match)).toThrow(/required|format/)
    })

    it('should throw for missing format', () => {
      const match = {}
      expect(() => getMatchFormat(match)).toThrow(/required|format/)
    })

    it('should throw for undefined format', () => {
      const match = { format: undefined }
      expect(() => getMatchFormat(match)).toThrow(/required|format/)
    })

    it('should throw for non-string format', () => {
      const match = { format: 123 }
      expect(() => getMatchFormat(match)).toThrow(/required|format/)
    })
  })

  describe('isSinglesMatch()', () => {
    it('should return true for singles', () => {
      expect(isSinglesMatch({ format: 'singles' })).toBe(true)
    })

    it('should return false for doubles', () => {
      expect(isSinglesMatch({ format: 'doubles' })).toBe(false)
    })

    it('should return false for invalid format', () => {
      expect(isSinglesMatch({ format: 'invalid' })).toBe(false)
    })

    it('should return false for null format', () => {
      expect(isSinglesMatch({ format: null })).toBe(false)
    })

    it('should return false for missing format', () => {
      expect(isSinglesMatch({})).toBe(false)
    })
  })

  describe('isDoublesMatch()', () => {
    it('should return true for doubles', () => {
      expect(isDoublesMatch({ format: 'doubles' })).toBe(true)
    })

    it('should return false for singles', () => {
      expect(isDoublesMatch({ format: 'singles' })).toBe(false)
    })

    it('should return false for invalid format', () => {
      expect(isDoublesMatch({ format: 'invalid' })).toBe(false)
    })

    it('should return false for null format', () => {
      expect(isDoublesMatch({ format: null })).toBe(false)
    })

    it('should return false for missing format', () => {
      expect(isDoublesMatch({})).toBe(false)
    })
  })

  describe('getMatchParticipantIds()', () => {
    it('should return player IDs for singles', () => {
      const match = { format: 'singles', player1_id: 'p1', player2_id: 'p2' }
      expect(getMatchParticipantIds(match)).toEqual(['p1', 'p2'])
    })

    it('should return team IDs for doubles', () => {
      const match = { format: 'doubles', team1_id: 't1', team2_id: 't2' }
      expect(getMatchParticipantIds(match)).toEqual(['t1', 't2'])
    })

    it('should throw when singles match missing player1_id', () => {
      const match = { format: 'singles', player2_id: 'p2' }
      expect(() => getMatchParticipantIds(match)).toThrow(/player|missing/)
    })

    it('should throw when singles match missing player2_id', () => {
      const match = { format: 'singles', player1_id: 'p1' }
      expect(() => getMatchParticipantIds(match)).toThrow(/player|missing/)
    })

    it('should throw when doubles match missing team1_id', () => {
      const match = { format: 'doubles', team2_id: 't2' }
      expect(() => getMatchParticipantIds(match)).toThrow(/team|missing/)
    })

    it('should throw when doubles match missing team2_id', () => {
      const match = { format: 'doubles', team1_id: 't1' }
      expect(() => getMatchParticipantIds(match)).toThrow(/team|missing/)
    })

    it('should throw for invalid format', () => {
      const match = { format: 'invalid', player1_id: 'p1', player2_id: 'p2' }
      expect(() => getMatchParticipantIds(match)).toThrow(/invalid|Invalid/)
    })
  })

  describe('validateMatchFormatConsistency()', () => {
    it('should accept valid singles match', () => {
      const match = { format: 'singles', player1_id: 'p1', player2_id: 'p2' }
      expect(() => validateMatchFormatConsistency(match)).not.toThrow()
    })

    it('should accept valid doubles match', () => {
      const match = { format: 'doubles', team1_id: 't1', team2_id: 't2' }
      expect(() => validateMatchFormatConsistency(match)).not.toThrow()
    })

    it('should throw for singles format with team IDs present', () => {
      const match = { format: 'singles', team1_id: 't1', team2_id: 't2' }
      expect(() => validateMatchFormatConsistency(match)).toThrow(/mismatch|format/)
    })

    it('should throw for doubles format with player IDs present', () => {
      const match = { format: 'doubles', player1_id: 'p1', player2_id: 'p2' }
      expect(() => validateMatchFormatConsistency(match)).toThrow(/mismatch|format/)
    })

    it('should throw for singles format with only team1_id', () => {
      const match = { format: 'singles', team1_id: 't1' }
      expect(() => validateMatchFormatConsistency(match)).toThrow(/mismatch|format/)
    })

    it('should throw for doubles format with only player1_id', () => {
      const match = { format: 'doubles', player1_id: 'p1' }
      expect(() => validateMatchFormatConsistency(match)).toThrow(/mismatch|format/)
    })
  })

  describe('getParticipantType()', () => {
    it('should return player for singles match', () => {
      expect(getParticipantType({ format: 'singles' })).toBe('player')
    })

    it('should return team for doubles match', () => {
      expect(getParticipantType({ format: 'doubles' })).toBe('team')
    })

    it('should return team for invalid format (default)', () => {
      expect(getParticipantType({ format: 'invalid' })).toBe('team')
    })

    it('should return team for null format (default)', () => {
      expect(getParticipantType({ format: null })).toBe('team')
    })
  })
})
