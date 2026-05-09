import { generateBracket, Bracket, BracketMatch, BracketRound } from '../index'

describe('Bracket Generation', () => {
  describe('Total Matches', () => {
    it('should generate 1 match for 2 players (minimum bracket)', () => {
      const bracket = generateBracket(2)
      expect(bracket.totalMatches).toBe(1)
    })

    it('should generate 3 matches for 4 players', () => {
      const bracket = generateBracket(4)
      expect(bracket.totalMatches).toBe(3)
    })

    it('should generate 7 matches for 8 players', () => {
      const bracket = generateBracket(8)
      expect(bracket.totalMatches).toBe(7)
    })

    it('should generate 15 matches for 16 players', () => {
      const bracket = generateBracket(16)
      expect(bracket.totalMatches).toBe(15)
    })

    it('should generate 31 matches for 32 players', () => {
      const bracket = generateBracket(32)
      expect(bracket.totalMatches).toBe(31)
    })

    it('should generate 15 matches for 13 players (next power of 2 is 16)', () => {
      const bracket = generateBracket(13)
      expect(bracket.totalMatches).toBe(15)
    })

    it('should always have totalMatches = bracketSize - 1', () => {
      for (const playerCount of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16, 17, 32]) {
        const bracket = generateBracket(playerCount)
        expect(bracket.totalMatches).toBe(bracket.rounds.reduce((sum: number, r: BracketRound) => sum + r.matches.length, 0))
      }
    })
  })

  describe('Bye Assignment', () => {
    it('should assign 0 byes for power-of-2 player counts', () => {
      expect(generateBracket(2).byeCount).toBe(0)
      expect(generateBracket(4).byeCount).toBe(0)
      expect(generateBracket(8).byeCount).toBe(0)
      expect(generateBracket(16).byeCount).toBe(0)
    })

    it('should assign 0 byes and empty byeRecipients for power-of-2 counts', () => {
      expect(generateBracket(2).byeRecipients).toEqual([])
      expect(generateBracket(8).byeRecipients).toEqual([])
    })

    it('should assign 1 bye for 3 players', () => {
      const bracket = generateBracket(3)
      expect(bracket.byeCount).toBe(1)
      expect(bracket.byeRecipients).toEqual(['seed_1'])
    })

    it('should assign 1 bye for 7 players', () => {
      const bracket = generateBracket(7)
      expect(bracket.byeCount).toBe(1)
      expect(bracket.byeRecipients).toEqual(['seed_1'])
    })

    it('should assign 2 byes for 6 players', () => {
      const bracket = generateBracket(6)
      expect(bracket.byeCount).toBe(2)
      expect(bracket.byeRecipients).toEqual(['seed_1', 'seed_2'])
    })

    it('should assign 3 byes for 5 players', () => {
      const bracket = generateBracket(5)
      expect(bracket.byeCount).toBe(3)
      expect(bracket.byeRecipients).toEqual(['seed_1', 'seed_2', 'seed_3'])
    })

    it('should assign 3 byes for 13 players', () => {
      const bracket = generateBracket(13)
      expect(bracket.byeCount).toBe(3)
      expect(bracket.byeRecipients).toEqual(['seed_1', 'seed_2', 'seed_3'])
    })

    it('should assign byes to top seeds first', () => {
      // For any player count, byeRecipients should be ['seed_1', 'seed_2', ..., 'seed_N'] in order
      for (const playerCount of [3, 5, 6, 7, 13]) {
        const bracket = generateBracket(playerCount)
        for (let i = 0; i < bracket.byeRecipients.length; i++) {
          expect(bracket.byeRecipients[i]).toBe(`seed_${i + 1}`)
        }
      }
    })

    it('should have byeCount + playerCount = bracket size (power of 2)', () => {
      for (const playerCount of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16, 17, 31, 32]) {
        const bracket = generateBracket(playerCount)
        const bracketSize = Math.pow(2, Math.ceil(Math.log2(playerCount)))
        expect(bracket.byeCount + playerCount).toBe(bracketSize)
      }
    })
  })

  describe('Seeding Correctness', () => {
    it('should match seed 1 vs seed N in round 1 for 4 players', () => {
      const bracket = generateBracket(4)
      const round1Matches = bracket.rounds[0].matches
      const seed1Match = round1Matches.find((m: BracketMatch) => m.player1 === 'seed_1' || m.player2 === 'seed_1')!
      const seed2Match = round1Matches.find((m: BracketMatch) => m.player1 === 'seed_2' || m.player2 === 'seed_2')!

      expect(seed1Match.player1).toBe('seed_1')
      expect(seed1Match.player2).toBe('seed_4')

      expect(seed2Match.player1).toBe('seed_2')
      expect(seed2Match.player2).toBe('seed_3')
    })

    it('should match seed 1 vs seed 8 and seed 2 vs seed 7 in 8-player bracket', () => {
      const bracket = generateBracket(8)
      const round1Matches = bracket.rounds[0].matches

      const seed1Match = round1Matches.find((m: BracketMatch) => m.player1 === 'seed_1' || m.player2 === 'seed_1')!
      expect([seed1Match.player1, seed1Match.player2].sort()).toEqual(['seed_1', 'seed_8'])

      const seed2Match = round1Matches.find((m: BracketMatch) => m.player1 === 'seed_2' || m.player2 === 'seed_2')!
      expect([seed2Match.player1, seed2Match.player2].sort()).toEqual(['seed_2', 'seed_7'])
    })

    it('should assign bye to seed 1 when it would play a missing seed for 13 players', () => {
      const bracket = generateBracket(13)
      const round1Matches = bracket.rounds[0].matches
      const seed1Match = round1Matches.find((m: BracketMatch) => m.player1 === 'seed_1' || m.player2 === 'seed_1')!

      expect(seed1Match.player1).toBe('seed_1')
      expect(seed1Match.player2).toBeNull()
    })

    it('should have seed 1 play winner of seed 8 vs seed 9 in round 2 for 13 players', () => {
      const bracket = generateBracket(13)

      // Find round 1 match with seed_1 bye
      const seed1ByeMatch = bracket.rounds[0].matches.find((m: BracketMatch) => m.player1 === 'seed_1' && m.player2 === null)!

      // Find round 2 match that has seed_1's bye match as input
      const seed1Round2Match = bracket.rounds[1].matches.find(
        (m: BracketMatch) => m.input1MatchId === seed1ByeMatch.id || m.input2MatchId === seed1ByeMatch.id
      )!
      expect(seed1Round2Match).toBeDefined()

      // Find the other input match (seed_8 vs seed_9)
      const otherInputId = seed1Round2Match.input1MatchId === seed1ByeMatch.id ? seed1Round2Match.input2MatchId : seed1Round2Match.input1MatchId
      const seed8vs9Match = bracket.rounds[0].matches.find((m: BracketMatch) => m.id === otherInputId)!

      expect([seed8vs9Match.player1, seed8vs9Match.player2].sort()).toEqual(['seed_8', 'seed_9'])
    })
  })

  describe('Bracket Structure Integrity', () => {
    it('should have final round with exactly 1 match', () => {
      for (const playerCount of [2, 3, 4, 5, 8, 13, 16, 32]) {
        const bracket = generateBracket(playerCount)
        const finalRound = bracket.rounds[bracket.rounds.length - 1]
        expect(finalRound.matches).toHaveLength(1)
      }
    })

    it('should have each round size be half of previous round', () => {
      const bracket = generateBracket(13)
      for (let i = 0; i < bracket.rounds.length - 1; i++) {
        expect(bracket.rounds[i].matches.length).toBe(bracket.rounds[i + 1].matches.length * 2)
      }
    })

    it('should have every round-N match feed into exactly one round-N+1 match', () => {
      const bracket = generateBracket(13)

      for (let roundIdx = 0; roundIdx < bracket.rounds.length - 1; roundIdx++) {
        const currentRound = bracket.rounds[roundIdx]
        const nextRound = bracket.rounds[roundIdx + 1]

        for (const match of currentRound.matches) {
          // Count how many matches in next round reference this match as input
          const countAsInput1 = nextRound.matches.filter(m => m.input1MatchId === match.id).length
          const countAsInput2 = nextRound.matches.filter(m => m.input2MatchId === match.id).length
          const totalReferences = countAsInput1 + countAsInput2

          expect(totalReferences).toBe(1)
        }
      }
    })

    it('should have no duplicate seed assignments in round 1', () => {
      for (const playerCount of [2, 4, 8, 13, 16, 32]) {
        const bracket = generateBracket(playerCount)
        const round1Seeds = bracket.rounds[0].matches
          .flatMap(m => [m.player1, m.player2])
          .filter(seed => seed !== null)

        expect(new Set(round1Seeds).size).toBe(round1Seeds.length)
      }
    })

    it('should have all round 1 matches contain non-null player1', () => {
      for (const playerCount of [2, 4, 8, 13, 16]) {
        const bracket = generateBracket(playerCount)
        for (const match of bracket.rounds[0].matches) {
          expect(match.player1).not.toBeNull()
        }
      }
    })

    it('should have correct number of matches per round', () => {
      const bracket = generateBracket(13)
      const bracketSize = 16

      for (let roundIdx = 0; roundIdx < bracket.rounds.length; roundIdx++) {
        const expectedMatches = bracketSize / Math.pow(2, roundIdx + 1)
        expect(bracket.rounds[roundIdx].matches).toHaveLength(expectedMatches)
      }
    })
  })

  describe('Match IDs and Properties', () => {
    it('should have unique match IDs across all rounds', () => {
      const bracket = generateBracket(13)
      const allMatches = bracket.rounds.flatMap(r => r.matches)
      const ids = allMatches.map(m => m.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('should have match.round match the round number', () => {
      const bracket = generateBracket(13)
      for (let roundIdx = 0; roundIdx < bracket.rounds.length; roundIdx++) {
        for (const match of bracket.rounds[roundIdx].matches) {
          expect(match.round).toBe(roundIdx + 1)
        }
      }
    })

    it('should have position numbers start at 1 per round', () => {
      const bracket = generateBracket(13)
      for (const round of bracket.rounds) {
        const positions = round.matches.map(m => m.position).sort((a, b) => a - b)
        expect(positions).toEqual(Array.from({ length: positions.length }, (_, i) => i + 1))
      }
    })

    it('should have input1MatchId and input2MatchId be null for round 1 matches', () => {
      const bracket = generateBracket(13)
      for (const match of bracket.rounds[0].matches) {
        expect(match.input1MatchId).toBeNull()
        expect(match.input2MatchId).toBeNull()
      }
    })

    it('should have input1MatchId and input2MatchId be non-null for rounds 2+', () => {
      const bracket = generateBracket(13)
      for (let roundIdx = 1; roundIdx < bracket.rounds.length; roundIdx++) {
        for (const match of bracket.rounds[roundIdx].matches) {
          expect(match.input1MatchId).not.toBeNull()
          expect(match.input2MatchId).not.toBeNull()
          expect(match.input1MatchId).not.toBe(match.input2MatchId)
        }
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle 2 players (minimum bracket)', () => {
      const bracket = generateBracket(2)
      expect(bracket.rounds).toHaveLength(1)
      expect(bracket.rounds[0].matches).toHaveLength(1)
      expect(bracket.rounds[0].matches[0].player1).toBe('seed_1')
      expect(bracket.rounds[0].matches[0].player2).toBe('seed_2')
      expect(bracket.byeCount).toBe(0)
    })

    it('should handle 3 players (1 match + 1 bye)', () => {
      const bracket = generateBracket(3)
      expect(bracket.rounds).toHaveLength(2)
      expect(bracket.rounds[0].matches).toHaveLength(2) // 1 bye match, 1 real match
      expect(bracket.rounds[1].matches).toHaveLength(1) // final

      // One of round 1 matches should be a bye (player2 null)
      const byeMatch = bracket.rounds[0].matches.find(m => m.player2 === null)
      expect(byeMatch).toBeDefined()
      expect(byeMatch!.player1).toBe('seed_1')
    })

    it('should handle stress test with 100+ player bracket', () => {
      const bracket = generateBracket(100)
      expect(bracket.totalMatches).toBe(127) // 128 - 1
      expect(bracket.byeCount).toBe(28) // 128 - 100
      expect(bracket.rounds).toHaveLength(7) // 2^7 = 128
    })
  })

  describe('Bracket Round Structure', () => {
    it('should have rounds array with correct order', () => {
      const bracket = generateBracket(13)
      for (let i = 0; i < bracket.rounds.length; i++) {
        expect(bracket.rounds[i].round).toBe(i + 1)
      }
    })

    it('should have rounds decrease in size exponentially', () => {
      const bracket = generateBracket(16)
      const sizes = bracket.rounds.map(r => r.matches.length)
      expect(sizes).toEqual([8, 4, 2, 1])
    })
  })
})
