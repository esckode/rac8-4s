import { TournamentStore } from '../state/tournament-state'
import type { Tournament } from '@shared/types'

const mockTournament: Tournament = {
  id: 'tour_1',
  name: 'Test Tournament',
  sport: 'tennis',
  matchFormat: 'singles',
  creatorId: 'org_1',
  maxPlayers: 8,
  registrationDeadline: '2026-05-20',
  groupStageDeadline: '2026-05-25',
  knockoutStageDeadline: '2026-05-30',
  status: 'registration_open',
  createdAt: '2026-05-01',
  updatedAt: '2026-05-01',
}

describe('TournamentStore', () => {
  let store: TournamentStore

  beforeEach(() => {
    store = new TournamentStore()
  })

  describe('currentPhase', () => {
    it('should return "Registration Open" for registration_open status', () => {
      store.set({ ...mockTournament, status: 'registration_open' })
      expect(store.currentPhase).toBe('Registration Open')
    })

    it('should return "Registration Closed" for registration_closed status', () => {
      store.set({ ...mockTournament, status: 'registration_closed' })
      expect(store.currentPhase).toBe('Registration Closed')
    })

    it('should return "Group Stage Active" for group_stage_active status', () => {
      store.set({ ...mockTournament, status: 'group_stage_active' })
      expect(store.currentPhase).toBe('Group Stage Active')
    })

    it('should return "Group Stage Complete" for group_stage_complete status', () => {
      store.set({ ...mockTournament, status: 'group_stage_complete' })
      expect(store.currentPhase).toBe('Group Stage Complete')
    })

    it('should return "Knockout Active" for knockout_active status', () => {
      store.set({ ...mockTournament, status: 'knockout_active' })
      expect(store.currentPhase).toBe('Knockout Active')
    })

    it('should return "Tournament Complete" for tournament_complete status', () => {
      store.set({ ...mockTournament, status: 'tournament_complete' })
      expect(store.currentPhase).toBe('Tournament Complete')
    })
  })

  describe('isRegistrationOpen', () => {
    it('should return true when status is registration_open', () => {
      store.set({ ...mockTournament, status: 'registration_open' })
      expect(store.isRegistrationOpen).toBe(true)
    })

    it('should return false for other statuses', () => {
      store.set({ ...mockTournament, status: 'registration_closed' })
      expect(store.isRegistrationOpen).toBe(false)

      store.set({ ...mockTournament, status: 'group_stage_active' })
      expect(store.isRegistrationOpen).toBe(false)
    })
  })

  describe('isGroupStageActive', () => {
    it('should return true when status is group_stage_active', () => {
      store.set({ ...mockTournament, status: 'group_stage_active' })
      expect(store.isGroupStageActive).toBe(true)
    })

    it('should return false for other statuses', () => {
      store.set({ ...mockTournament, status: 'registration_open' })
      expect(store.isGroupStageActive).toBe(false)

      store.set({ ...mockTournament, status: 'knockout_active' })
      expect(store.isGroupStageActive).toBe(false)
    })
  })

  describe('isKnockoutActive', () => {
    it('should return true when status is knockout_active', () => {
      store.set({ ...mockTournament, status: 'knockout_active' })
      expect(store.isKnockoutActive).toBe(true)
    })

    it('should return false for other statuses', () => {
      store.set({ ...mockTournament, status: 'group_stage_active' })
      expect(store.isKnockoutActive).toBe(false)

      store.set({ ...mockTournament, status: 'tournament_complete' })
      expect(store.isKnockoutActive).toBe(false)
    })
  })

  describe('isComplete', () => {
    it('should return true when status is tournament_complete', () => {
      store.set({ ...mockTournament, status: 'tournament_complete' })
      expect(store.isComplete).toBe(true)
    })

    it('should return false for other statuses', () => {
      store.set({ ...mockTournament, status: 'knockout_active' })
      expect(store.isComplete).toBe(false)

      store.set({ ...mockTournament, status: 'registration_open' })
      expect(store.isComplete).toBe(false)
    })
  })

  describe('set(tournament)', () => {
    it('should update the internal tournament state', () => {
      store.set(mockTournament)
      expect(store.currentPhase).toBe('Registration Open')
    })

    it('should trigger subscriber callbacks', () => {
      const callback = jest.fn()
      store.subscribe(callback)

      store.set(mockTournament)

      expect(callback).toHaveBeenCalledWith(mockTournament)
    })

    it('should trigger all subscribers when state changes', () => {
      const callback1 = jest.fn()
      const callback2 = jest.fn()
      store.subscribe(callback1)
      store.subscribe(callback2)

      store.set(mockTournament)

      expect(callback1).toHaveBeenCalledWith(mockTournament)
      expect(callback2).toHaveBeenCalledWith(mockTournament)
    })
  })

  describe('subscribe(callback)', () => {
    it('should return an unsubscribe function', () => {
      const callback = jest.fn()
      const unsubscribe = store.subscribe(callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should not call callback after unsubscribe', () => {
      const callback = jest.fn()
      const unsubscribe = store.subscribe(callback)

      store.set(mockTournament)
      expect(callback).toHaveBeenCalledTimes(1)

      unsubscribe()
      store.set({ ...mockTournament, name: 'Updated Name' })

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should fire callback for each set() call after subscription', () => {
      const callback = jest.fn()
      store.subscribe(callback)

      store.set(mockTournament)
      store.set({ ...mockTournament, status: 'registration_closed' })

      expect(callback).toHaveBeenCalledTimes(2)
    })
  })

  describe('clear()', () => {
    it('should reset state to idle', () => {
      store.set(mockTournament)
      expect(store.currentPhase).toBe('Registration Open')

      store.clear()

      // After clear, tournament should be undefined, so we expect a getter that handles this
      expect(store.tournament).toBeUndefined()
    })

    it('should fire subscribers when cleared', () => {
      const callback = jest.fn()
      store.set(mockTournament)
      store.subscribe(callback)

      store.clear()

      expect(callback).toHaveBeenCalledWith(undefined)
    })
  })

  describe('tournament property', () => {
    it('should return undefined before set is called', () => {
      expect(store.tournament).toBeUndefined()
    })

    it('should return the tournament after set is called', () => {
      store.set(mockTournament)
      expect(store.tournament).toEqual(mockTournament)
    })
  })
})
