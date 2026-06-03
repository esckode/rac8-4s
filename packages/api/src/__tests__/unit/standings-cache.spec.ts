import { InMemoryStandingsCache } from '../../standings-cache'
import type { Standing } from '@shared/types'

describe('InMemoryStandingsCache', () => {
  describe('initialization', () => {
    it('creates cache instance', () => {
      const cache = new InMemoryStandingsCache()
      expect(cache).toBeInstanceOf(InMemoryStandingsCache)
    })

    it('returns null for uninitialized groups', () => {
      const cache = new InMemoryStandingsCache()
      expect(cache.get('nonexistent_group')).toBeNull()
    })
  })

  describe('set standings', () => {
    it('stores standings for a group', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 3, losses: 0, setsWon: 6, setsLost: 0 },
        { participantId: 'p2', rank: 2, wins: 2, losses: 1, setsWon: 5, setsLost: 1 },
      ]

      cache.set('group_1', standings)
      expect(cache.get('group_1')).toEqual(standings)
    })

    it('updates standings when called multiple times for same group', () => {
      const cache = new InMemoryStandingsCache()
      const standings1: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 },
      ]
      const standings2: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 3, losses: 0, setsWon: 6, setsLost: 0 },
      ]

      cache.set('group_1', standings1)
      expect(cache.get('group_1')).toEqual(standings1)

      cache.set('group_1', standings2)
      expect(cache.get('group_1')).toEqual(standings2)
    })

    it('stores empty standings array', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = []

      cache.set('group_empty', standings)
      expect(cache.get('group_empty')).toEqual([])
    })

    it('stores standings with single entry', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'solo_player', rank: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 },
      ]

      cache.set('group_single', standings)
      expect(cache.get('group_single')).toEqual(standings)
    })

    it('stores large standings list', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = Array.from({ length: 100 }, (_, i) => ({
        participantId: `participant_${i}`,
        rank: i + 1,
        wins: Math.floor(Math.random() * 10),
        losses: Math.floor(Math.random() * 10),
        setsWon: Math.floor(Math.random() * 20),
        setsLost: Math.floor(Math.random() * 20),
      }))

      cache.set('group_large', standings)
      expect(cache.get('group_large')).toEqual(standings)
      expect(cache.get('group_large')).toHaveLength(100)
    })
  })

  describe('get standings', () => {
    it('returns standings by groupId', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 5, losses: 0, setsWon: 10, setsLost: 0 },
      ]

      cache.set('group_1', standings)
      const retrieved = cache.get('group_1')

      expect(retrieved).toEqual(standings)
    })

    it('returns exact same array reference', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 1, losses: 1, setsWon: 2, setsLost: 2 },
      ]

      cache.set('group_1', standings)
      const retrieved = cache.get('group_1')

      expect(retrieved).toBe(standings)
    })

    it('returns undefined (null) for missing groupId', () => {
      const cache = new InMemoryStandingsCache()
      expect(cache.get('missing_group')).toBeNull()
    })

    it('returns standings after multiple sets', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 2, losses: 1, setsWon: 4, setsLost: 2 },
      ]

      cache.set('group_1', standings)
      cache.set('group_2', [{ participantId: 'p2', rank: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 }])

      expect(cache.get('group_1')).toEqual(standings)
    })
  })

  describe('clear standings', () => {
    it('clears standings for a group', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 4, losses: 0, setsWon: 8, setsLost: 0 },
      ]

      cache.set('group_1', standings)
      expect(cache.get('group_1')).toEqual(standings)

      cache.clear('group_1')
      expect(cache.get('group_1')).toBeNull()
    })

    it('returns null after clearing', () => {
      const cache = new InMemoryStandingsCache()
      cache.set('group_1', [{ participantId: 'p1', rank: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 }])
      cache.clear('group_1')

      expect(cache.get('group_1')).toBeNull()
    })

    it('clears specific group without affecting others', () => {
      const cache = new InMemoryStandingsCache()
      const standings1: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 },
      ]
      const standings2: Standing[] = [
        { participantId: 'p2', rank: 1, wins: 3, losses: 0, setsWon: 6, setsLost: 0 },
      ]

      cache.set('group_1', standings1)
      cache.set('group_2', standings2)

      cache.clear('group_1')

      expect(cache.get('group_1')).toBeNull()
      expect(cache.get('group_2')).toEqual(standings2)
    })

    it('clears empty standings', () => {
      const cache = new InMemoryStandingsCache()
      cache.set('group_empty', [])
      cache.clear('group_empty')

      expect(cache.get('group_empty')).toBeNull()
    })

    it('clearing non-existent group does not throw error', () => {
      const cache = new InMemoryStandingsCache()
      expect(() => {
        cache.clear('nonexistent')
      }).not.toThrow()
    })
  })

  describe('multiple groups independence', () => {
    it('maintains separate standings for different groups', () => {
      const cache = new InMemoryStandingsCache()
      const group1: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 5, losses: 0, setsWon: 10, setsLost: 0 },
      ]
      const group2: Standing[] = [
        { participantId: 'p2', rank: 1, wins: 2, losses: 3, setsWon: 4, setsLost: 6 },
      ]

      cache.set('group_1', group1)
      cache.set('group_2', group2)

      expect(cache.get('group_1')).toEqual(group1)
      expect(cache.get('group_2')).toEqual(group2)
      expect(cache.get('group_1')).not.toEqual(group2)
    })

    it('allows concurrent operations on different groups', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 1, losses: 1, setsWon: 2, setsLost: 2 },
      ]

      for (let i = 0; i < 10; i++) {
        cache.set(`group_${i}`, standings)
      }

      for (let i = 0; i < 10; i++) {
        expect(cache.get(`group_${i}`)).toEqual(standings)
      }
    })

    it('clear on one group does not affect others', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 1, losses: 1, setsWon: 2, setsLost: 2 },
      ]

      cache.set('group_a', standings)
      cache.set('group_b', standings)
      cache.set('group_c', standings)

      cache.clear('group_b')

      expect(cache.get('group_a')).toEqual(standings)
      expect(cache.get('group_b')).toBeNull()
      expect(cache.get('group_c')).toEqual(standings)
    })

    it('clears multiple groups independently', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 1, losses: 1, setsWon: 2, setsLost: 2 },
      ]

      cache.set('group_1', standings)
      cache.set('group_2', standings)
      cache.set('group_3', standings)

      cache.clear('group_1')
      cache.clear('group_3')

      expect(cache.get('group_1')).toBeNull()
      expect(cache.get('group_2')).toEqual(standings)
      expect(cache.get('group_3')).toBeNull()
    })
  })

  describe('state preservation', () => {
    it('preserves standings across multiple operations', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 3, losses: 2, setsWon: 6, setsLost: 4 },
        { participantId: 'p2', rank: 2, wins: 2, losses: 3, setsWon: 5, setsLost: 6 },
      ]

      cache.set('group_1', standings)
      const retrieved1 = cache.get('group_1')

      cache.set('group_2', [{ participantId: 'p3', rank: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 }])
      const retrieved2 = cache.get('group_1')

      expect(retrieved1).toEqual(standings)
      expect(retrieved2).toEqual(standings)
    })

    it('allows reusing same groupId after clearing', () => {
      const cache = new InMemoryStandingsCache()
      const standings1: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 },
      ]
      const standings2: Standing[] = [
        { participantId: 'p2', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 },
      ]

      cache.set('group_1', standings1)
      cache.clear('group_1')
      cache.set('group_1', standings2)

      expect(cache.get('group_1')).toEqual(standings2)
    })
  })

  describe('StandingsCache interface compliance', () => {
    it('implements StandingsCache interface', () => {
      const cache = new InMemoryStandingsCache()

      expect(typeof cache.get).toBe('function')
      expect(typeof cache.set).toBe('function')
      expect(typeof cache.clear).toBe('function')
    })

    it('get returns Standing[] | null', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = [
        { participantId: 'p1', rank: 1, wins: 0, losses: 0, setsWon: 0, setsLost: 0 },
      ]

      cache.set('group_1', standings)
      const result = cache.get('group_1')

      expect(Array.isArray(result) || result === null).toBe(true)
    })

    it('set accepts groupId and standings', () => {
      const cache = new InMemoryStandingsCache()
      const standings: Standing[] = []

      expect(() => {
        cache.set('group_1', standings)
      }).not.toThrow()
    })

    it('clear accepts groupId', () => {
      const cache = new InMemoryStandingsCache()
      cache.set('group_1', [])

      expect(() => {
        cache.clear('group_1')
      }).not.toThrow()
    })
  })
})
