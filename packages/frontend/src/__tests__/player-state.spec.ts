import { PlayerCache } from '../state/player-state'
import type { Player } from '@shared/types'

const mockPlayer1: Player = {
  id: 'p1',
  email: 'alice@test.com',
  name: 'Alice',
}

const mockPlayer2: Player = {
  id: 'p2',
  email: 'bob@test.com',
  name: 'Bob',
}

const mockPlayer3: Player = {
  id: 'p3',
  email: 'charlie@test.com',
  name: 'Charlie',
}

describe('PlayerCache', () => {
  let cache: PlayerCache

  beforeEach(() => {
    cache = new PlayerCache()
  })

  describe('get', () => {
    it('should return undefined for uncached player', () => {
      const player = cache.get('p1')
      expect(player).toBeUndefined()
    })

    it('should return cached player after set', () => {
      cache.set(mockPlayer1)
      const player = cache.get('p1')
      expect(player).toEqual(mockPlayer1)
    })

    it('should return correct player when multiple are cached', () => {
      cache.set(mockPlayer1)
      cache.set(mockPlayer2)

      const p1 = cache.get('p1')
      const p2 = cache.get('p2')

      expect(p1).toEqual(mockPlayer1)
      expect(p2).toEqual(mockPlayer2)
    })
  })

  describe('set', () => {
    it('should cache a single player', () => {
      cache.set(mockPlayer1)
      expect(cache.get('p1')).toEqual(mockPlayer1)
    })

    it('should update existing cached player', () => {
      cache.set(mockPlayer1)
      const updated = { ...mockPlayer1, name: 'Alice Updated' }
      cache.set(updated)

      expect(cache.get('p1')).toEqual(updated)
    })
  })

  describe('setMany', () => {
    it('should cache multiple players at once', () => {
      cache.setMany([mockPlayer1, mockPlayer2, mockPlayer3])

      expect(cache.get('p1')).toEqual(mockPlayer1)
      expect(cache.get('p2')).toEqual(mockPlayer2)
      expect(cache.get('p3')).toEqual(mockPlayer3)
    })

    it('should update existing players when called with overlapping IDs', () => {
      cache.setMany([mockPlayer1, mockPlayer2])
      const updated = { ...mockPlayer2, name: 'Bob Updated' }
      cache.setMany([updated])

      expect(cache.get('p1')).toEqual(mockPlayer1)
      expect(cache.get('p2')).toEqual(updated)
    })

    it('should handle empty array', () => {
      cache.setMany([])
      expect(cache.get('p1')).toBeUndefined()
    })
  })

  describe('invalidate', () => {
    it('should remove a cached player', () => {
      cache.set(mockPlayer1)
      expect(cache.get('p1')).toEqual(mockPlayer1)

      cache.invalidate('p1')
      expect(cache.get('p1')).toBeUndefined()
    })

    it('should not affect other cached players', () => {
      cache.setMany([mockPlayer1, mockPlayer2, mockPlayer3])
      cache.invalidate('p2')

      expect(cache.get('p1')).toEqual(mockPlayer1)
      expect(cache.get('p2')).toBeUndefined()
      expect(cache.get('p3')).toEqual(mockPlayer3)
    })

    it('should be a no-op if player not cached', () => {
      cache.setMany([mockPlayer1, mockPlayer2])
      cache.invalidate('p_unknown')

      expect(cache.get('p1')).toEqual(mockPlayer1)
      expect(cache.get('p2')).toEqual(mockPlayer2)
    })
  })

  describe('clear', () => {
    it('should clear all cached players', () => {
      cache.setMany([mockPlayer1, mockPlayer2, mockPlayer3])

      cache.clear()

      expect(cache.get('p1')).toBeUndefined()
      expect(cache.get('p2')).toBeUndefined()
      expect(cache.get('p3')).toBeUndefined()
    })

    it('should allow re-caching after clear', () => {
      cache.setMany([mockPlayer1, mockPlayer2])
      cache.clear()
      cache.set(mockPlayer3)

      expect(cache.get('p3')).toEqual(mockPlayer3)
      expect(cache.get('p1')).toBeUndefined()
    })
  })
})
