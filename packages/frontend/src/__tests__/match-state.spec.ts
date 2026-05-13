import { MatchStore } from '../state/match-state'
import type { MatchWithOpponent } from '../types'

const groupMatch: MatchWithOpponent = {
  id: 'match_1',
  tournamentId: 'tour_1',
  player1Id: 'p1',
  player2Id: 'p2',
  status: 'pending',
  type: 'group',
  player1Confirmed: false,
  player2Confirmed: false,
  opponent: {
    playerId: 'p2',
    name: 'Bob',
    email: 'bob@test.com',
    confirmed: false,
  },
}

const completedGroupMatch: MatchWithOpponent = {
  id: 'match_2',
  tournamentId: 'tour_1',
  player1Id: 'p1',
  player2Id: 'p3',
  status: 'completed',
  score: '6-4, 6-3',
  type: 'group',
  player1Confirmed: true,
  player2Confirmed: true,
  opponent: {
    playerId: 'p3',
    name: 'Charlie',
    email: 'charlie@test.com',
    confirmed: true,
  },
}

const knockoutMatch: MatchWithOpponent = {
  id: 'match_3',
  tournamentId: 'tour_1',
  player1Id: 'p1',
  player2Id: 'p4',
  status: 'pending',
  type: 'knockout',
  round: 1,
  position: 1,
  player1Confirmed: false,
  player2Confirmed: false,
  opponent: {
    playerId: 'p4',
    name: 'David',
    email: 'david@test.com',
    confirmed: false,
  },
}

const knockoutMatch2: MatchWithOpponent = {
  id: 'match_4',
  tournamentId: 'tour_1',
  player1Id: 'p1',
  player2Id: 'p5',
  status: 'pending',
  type: 'knockout',
  round: 2,
  position: 1,
  player1Confirmed: false,
  player2Confirmed: false,
  opponent: {
    playerId: 'p5',
    name: 'Eve',
    email: 'eve@test.com',
    confirmed: false,
  },
}

describe('MatchStore', () => {
  let store: MatchStore

  beforeEach(() => {
    store = new MatchStore()
  })

  describe('setMatches', () => {
    it('should set matches in the store', () => {
      store.setMatches([groupMatch, completedGroupMatch])

      expect(store.all()).toHaveLength(2)
    })

    it('should replace existing matches when called again', () => {
      store.setMatches([groupMatch, completedGroupMatch])
      expect(store.all()).toHaveLength(2)

      store.setMatches([groupMatch])
      expect(store.all()).toHaveLength(1)
    })
  })

  describe('all', () => {
    it('should return empty array initially', () => {
      expect(store.all()).toEqual([])
    })

    it('should return all matches after setMatches', () => {
      const matches = [groupMatch, completedGroupMatch]
      store.setMatches(matches)

      expect(store.all()).toEqual(matches)
    })
  })

  describe('filterUpcoming', () => {
    it('should return only pending matches', () => {
      store.setMatches([groupMatch, completedGroupMatch, knockoutMatch])

      const upcoming = store.filterUpcoming()

      expect(upcoming).toHaveLength(2)
      expect(upcoming).toEqual(expect.arrayContaining([groupMatch, knockoutMatch]))
      expect(upcoming).not.toContainEqual(completedGroupMatch)
    })

    it('should return empty array when no pending matches', () => {
      store.setMatches([completedGroupMatch])

      const upcoming = store.filterUpcoming()

      expect(upcoming).toEqual([])
    })

    it('should include both group and knockout pending matches', () => {
      store.setMatches([groupMatch, knockoutMatch])

      const upcoming = store.filterUpcoming()

      expect(upcoming).toHaveLength(2)
      expect(upcoming.some(m => m.type === 'group')).toBe(true)
      expect(upcoming.some(m => m.type === 'knockout')).toBe(true)
    })
  })

  describe('filterCompleted', () => {
    it('should return only completed matches', () => {
      store.setMatches([groupMatch, completedGroupMatch, knockoutMatch])

      const completed = store.filterCompleted()

      expect(completed).toHaveLength(1)
      expect(completed[0]).toEqual(completedGroupMatch)
    })

    it('should return empty array when no completed matches', () => {
      store.setMatches([groupMatch, knockoutMatch])

      const completed = store.filterCompleted()

      expect(completed).toEqual([])
    })
  })

  describe('filterByType', () => {
    it('should return only group matches when filtering for group', () => {
      store.setMatches([groupMatch, completedGroupMatch, knockoutMatch])

      const groupMatches = store.filterByType('group')

      expect(groupMatches).toHaveLength(2)
      expect(groupMatches).toEqual(
        expect.arrayContaining([groupMatch, completedGroupMatch])
      )
    })

    it('should return only knockout matches when filtering for knockout', () => {
      store.setMatches([groupMatch, completedGroupMatch, knockoutMatch, knockoutMatch2])

      const knockoutMatches = store.filterByType('knockout')

      expect(knockoutMatches).toHaveLength(2)
      expect(knockoutMatches).toEqual(
        expect.arrayContaining([knockoutMatch, knockoutMatch2])
      )
    })
  })

  describe('filterByRound', () => {
    it('should return only matches from specified round', () => {
      store.setMatches([knockoutMatch, knockoutMatch2, groupMatch])

      const round1 = store.filterByRound(1)

      expect(round1).toHaveLength(1)
      expect(round1[0].id).toBe('match_3')
    })

    it('should return only knockout matches (group matches have no round)', () => {
      store.setMatches([groupMatch, knockoutMatch, knockoutMatch2])

      const round1 = store.filterByRound(1)

      expect(round1).toHaveLength(1)
      expect(round1[0].type).toBe('knockout')
    })

    it('should return empty array if no matches in round', () => {
      store.setMatches([knockoutMatch])

      const round99 = store.filterByRound(99)

      expect(round99).toEqual([])
    })
  })

  describe('combined filtering', () => {
    it('should support chaining filters: upcoming knockout matches', () => {
      store.setMatches([groupMatch, completedGroupMatch, knockoutMatch, knockoutMatch2])

      const upcomingKnockout = store
        .filterUpcoming()
        .filter(m => m.type === 'knockout')

      expect(upcomingKnockout).toHaveLength(2)
      expect(upcomingKnockout).toEqual(expect.arrayContaining([knockoutMatch, knockoutMatch2]))
    })

    it('should support filtering by type then round', () => {
      store.setMatches([knockoutMatch, knockoutMatch2, groupMatch])

      const round1Knockout = store
        .filterByType('knockout')
        .filter(m => m.round === 1)

      expect(round1Knockout).toHaveLength(1)
      expect(round1Knockout[0].id).toBe('match_3')
    })
  })

  describe('clear', () => {
    it('should clear all matches', () => {
      store.setMatches([groupMatch, completedGroupMatch, knockoutMatch])
      expect(store.all()).toHaveLength(3)

      store.clear()

      expect(store.all()).toEqual([])
    })
  })
})
