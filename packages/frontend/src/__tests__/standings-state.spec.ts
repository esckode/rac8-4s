import { StandingsStore } from '../state/standings-state'
import type { StandingsUpdatedPayload } from '../types'
import type { Standing } from '@shared/types'

const mockStandings: Standing[] = [
  { playerId: 'p1', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 1 },
  { playerId: 'p2', rank: 2, wins: 1, losses: 1, setsWon: 3, setsLost: 2 },
]

const mockStandings2: Standing[] = [
  { playerId: 'p3', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 },
  { playerId: 'p4', rank: 2, wins: 0, losses: 2, setsWon: 0, setsLost: 4 },
]

describe('StandingsStore', () => {
  let store: StandingsStore

  beforeEach(() => {
    store = new StandingsStore()
  })

  describe('getByGroup', () => {
    it('should return empty array for unknown group initially', () => {
      const standings = store.getByGroup('group_unknown')
      expect(standings).toEqual([])
    })

    it('should return standings after update is called', () => {
      const payload: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: mockStandings,
      }
      store.update(payload)

      const standings = store.getByGroup('group_1')
      expect(standings).toEqual(mockStandings)
    })

    it('should return different standings for different groups', () => {
      store.update({ groupId: 'group_1', standings: mockStandings })
      store.update({ groupId: 'group_2', standings: mockStandings2 })

      const standings1 = store.getByGroup('group_1')
      const standings2 = store.getByGroup('group_2')

      expect(standings1).toEqual(mockStandings)
      expect(standings2).toEqual(mockStandings2)
    })
  })

  describe('update', () => {
    it('should replace standings for a group', () => {
      const payload1: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: mockStandings,
      }
      store.update(payload1)

      expect(store.getByGroup('group_1')).toEqual(mockStandings)

      const updatedStandings: Standing[] = [
        { playerId: 'p1', rank: 1, wins: 3, losses: 0, setsWon: 6, setsLost: 1 },
      ]
      const payload2: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: updatedStandings,
      }
      store.update(payload2)

      expect(store.getByGroup('group_1')).toEqual(updatedStandings)
    })

    it('should store multiple groups independently', () => {
      store.update({ groupId: 'group_1', standings: mockStandings })
      store.update({ groupId: 'group_2', standings: mockStandings2 })

      expect(store.getByGroup('group_1')).toEqual(mockStandings)
      expect(store.getByGroup('group_2')).toEqual(mockStandings2)
    })

    it('should trigger subscriber callback on update', () => {
      const callback = jest.fn()
      store.subscribe(callback)

      const payload: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: mockStandings,
      }
      store.update(payload)

      expect(callback).toHaveBeenCalledWith('group_1', mockStandings)
    })

    it('should trigger multiple subscribers', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      store.subscribe(callback1)
      store.subscribe(callback2)

      const payload: StandingsUpdatedPayload = {
        groupId: 'group_1',
        standings: mockStandings,
      }
      store.update(payload)

      expect(callback1).toHaveBeenCalledWith('group_1', mockStandings)
      expect(callback2).toHaveBeenCalledWith('group_1', mockStandings)
    })
  })

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const callback = jest.fn()
      const unsubscribe = store.subscribe(callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should not call callback after unsubscribe', () => {
      const callback = jest.fn()
      const unsubscribe = store.subscribe(callback)

      store.update({ groupId: 'group_1', standings: mockStandings })
      expect(callback).toHaveBeenCalledTimes(1)

      unsubscribe()
      store.update({ groupId: 'group_1', standings: mockStandings2 })

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should call callback for each update', () => {
      const callback = jest.fn()
      store.subscribe(callback)

      store.update({ groupId: 'group_1', standings: mockStandings })
      store.update({ groupId: 'group_2', standings: mockStandings2 })
      store.update({ groupId: 'group_1', standings: mockStandings2 })

      expect(callback).toHaveBeenCalledTimes(3)
    })
  })

  describe('clear', () => {
    it('should clear all standings', () => {
      store.update({ groupId: 'group_1', standings: mockStandings })
      store.update({ groupId: 'group_2', standings: mockStandings2 })

      store.clear()

      expect(store.getByGroup('group_1')).toEqual([])
      expect(store.getByGroup('group_2')).toEqual([])
    })
  })
})
