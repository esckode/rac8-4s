import { TournamentStateMachine, TournamentState } from '../index'

describe('Tournament State Machine', () => {
  describe('Valid State Transitions', () => {
    it('should transition from Registration Open to Registration Closed', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const result = machine.transition('CLOSE_REGISTRATION')

      expect(result.success).toBe(true)
      expect(result.state).toBe('REGISTRATION_CLOSED')
      expect(machine.currentState).toBe('REGISTRATION_CLOSED')
    })

    it('should transition from Registration Closed to Group Stage', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_GROUP_STAGE')

      expect(result.success).toBe(true)
      expect(result.state).toBe('GROUP_STAGE_ACTIVE')
    })

    it('should transition from Group Stage Active to Group Stage Complete', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('COMPLETE_GROUP_STAGE')

      expect(result.success).toBe(true)
      expect(result.state).toBe('GROUP_STAGE_COMPLETE')
    })

    it('should transition from Group Stage Complete to Knockout Active', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_COMPLETE')
      const result = machine.transition('START_KNOCKOUT')

      expect(result.success).toBe(true)
      expect(result.state).toBe('KNOCKOUT_ACTIVE')
    })

    it('should transition from Knockout Active to Tournament Complete', () => {
      const machine = new TournamentStateMachine('KNOCKOUT_ACTIVE')
      const result = machine.transition('COMPLETE_TOURNAMENT')

      expect(result.success).toBe(true)
      expect(result.state).toBe('TOURNAMENT_COMPLETE')
    })

    it('should support full tournament lifecycle', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')

      expect(machine.transition('CLOSE_REGISTRATION').success).toBe(true)
      expect(machine.currentState).toBe('REGISTRATION_CLOSED')

      expect(machine.transition('START_GROUP_STAGE').success).toBe(true)
      expect(machine.currentState).toBe('GROUP_STAGE_ACTIVE')

      expect(machine.transition('COMPLETE_GROUP_STAGE').success).toBe(true)
      expect(machine.currentState).toBe('GROUP_STAGE_COMPLETE')

      expect(machine.transition('START_KNOCKOUT').success).toBe(true)
      expect(machine.currentState).toBe('KNOCKOUT_ACTIVE')

      expect(machine.transition('COMPLETE_TOURNAMENT').success).toBe(true)
      expect(machine.currentState).toBe('TOURNAMENT_COMPLETE')
    })
  })

  describe('Invalid Transitions - Cannot Go Backwards', () => {
    it('should reject transition from Registration Closed back to Registration Open', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('OPEN_REGISTRATION')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
      expect(machine.currentState).toBe('REGISTRATION_CLOSED')
    })

    it('should reject transition from Group Stage Active back to Registration Closed', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('CLOSE_REGISTRATION')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should reject transition from Knockout Active back to Group Stage', () => {
      const machine = new TournamentStateMachine('KNOCKOUT_ACTIVE')
      const result = machine.transition('START_GROUP_STAGE')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })
  })

  describe('Invalid Transitions - Cannot Skip Phases', () => {
    it('should reject transition from Registration Open directly to Group Stage', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const result = machine.transition('START_GROUP_STAGE')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should reject transition from Registration Closed directly to Knockout', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_KNOCKOUT')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should reject transition from Group Stage Active directly to Tournament Complete', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('COMPLETE_TOURNAMENT')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should reject transition from Registration Open to Knockout', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const result = machine.transition('START_KNOCKOUT')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })
  })

  describe('State Guards - Conditions for Advancement', () => {
    it('should allow advancement to Group Stage when guard condition is met', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_GROUP_STAGE', { playersRegistered: true })

      expect(result.success).toBe(true)
      expect(result.state).toBe('GROUP_STAGE_ACTIVE')
    })

    it('should reject advancement if guard condition is not met', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_GROUP_STAGE', { playersRegistered: false })

      expect(result.success).toBe(false)
      expect(result.error).toBe('GUARD_FAILED')
    })

    it('should reject Group Stage completion without all scores submitted', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('COMPLETE_GROUP_STAGE', { allScoresSubmitted: false })

      expect(result.success).toBe(false)
      expect(result.error).toBe('GUARD_FAILED')
    })

    it('should allow Group Stage completion when all scores submitted', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('COMPLETE_GROUP_STAGE', { allScoresSubmitted: true })

      expect(result.success).toBe(true)
    })

    it('should reject Knockout advancement without standings calculated', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_COMPLETE')
      const result = machine.transition('START_KNOCKOUT', { standingsCalculated: false })

      expect(result.success).toBe(false)
      expect(result.error).toBe('GUARD_FAILED')
    })

    it('should reject Knockout advancement without bracket generated', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_COMPLETE')
      const result = machine.transition('START_KNOCKOUT', {
        standingsCalculated: true,
        bracketGenerated: false
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('GUARD_FAILED')
    })

    it('should allow Knockout advancement when all conditions met', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_COMPLETE')
      const result = machine.transition('START_KNOCKOUT', {
        standingsCalculated: true,
        bracketGenerated: true
      })

      expect(result.success).toBe(true)
    })

    it('should reject tournament completion without all knockout scores', () => {
      const machine = new TournamentStateMachine('KNOCKOUT_ACTIVE')
      const result = machine.transition('COMPLETE_TOURNAMENT', { allKnockoutScoresSubmitted: false })

      expect(result.success).toBe(false)
      expect(result.error).toBe('GUARD_FAILED')
    })

    it('should allow tournament completion when all knockout scores submitted', () => {
      const machine = new TournamentStateMachine('KNOCKOUT_ACTIVE')
      const result = machine.transition('COMPLETE_TOURNAMENT', { allKnockoutScoresSubmitted: true })

      expect(result.success).toBe(true)
    })
  })

  describe('Manual Override - Organizer Force Advancement', () => {
    it('should allow organizer to force advance from Registration Closed to Group Stage', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_GROUP_STAGE', { forceAdvance: true })

      expect(result.success).toBe(true)
      expect(result.state).toBe('GROUP_STAGE_ACTIVE')
    })

    it('should allow organizer to force advance even if guard conditions not met', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_GROUP_STAGE', {
        playersRegistered: false,
        forceAdvance: true
      })

      expect(result.success).toBe(true)
      expect(result.state).toBe('GROUP_STAGE_ACTIVE')
    })

    it('should allow organizer to force complete group stage even without all scores', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('COMPLETE_GROUP_STAGE', {
        allScoresSubmitted: false,
        forceAdvance: true
      })

      expect(result.success).toBe(true)
    })

    it('should not allow force advance to skip phases', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const result = machine.transition('START_KNOCKOUT', { forceAdvance: true })

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should not allow force advance to go backwards', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('CLOSE_REGISTRATION', { forceAdvance: true })

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })
  })

  describe('Edge Cases', () => {
    it('should handle invalid transition action', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const result = machine.transition('INVALID_ACTION' as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should handle transition from final state', () => {
      const machine = new TournamentStateMachine('TOURNAMENT_COMPLETE')
      const result = machine.transition('COMPLETE_TOURNAMENT')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })

    it('should preserve state on failed transition', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const originalState = machine.currentState

      machine.transition('START_KNOCKOUT')

      expect(machine.currentState).toBe(originalState)
    })

    it('should provide error message on guard failure', () => {
      const machine = new TournamentStateMachine('REGISTRATION_CLOSED')
      const result = machine.transition('START_GROUP_STAGE', { playersRegistered: false })

      expect(result.error).toBe('GUARD_FAILED')
      expect(result.message).toBeDefined()
    })

    it('should handle multiple rapid transitions', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')

      const result1 = machine.transition('CLOSE_REGISTRATION')
      expect(result1.success).toBe(true)

      const result2 = machine.transition('START_GROUP_STAGE', { playersRegistered: true })
      expect(result2.success).toBe(true)

      const result3 = machine.transition('COMPLETE_GROUP_STAGE', { allScoresSubmitted: true })
      expect(result3.success).toBe(true)

      expect(machine.currentState).toBe('GROUP_STAGE_COMPLETE')
    })

    it('should not allow registration reopening in later phases', () => {
      const machine = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const result = machine.transition('OPEN_REGISTRATION')

      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_TRANSITION')
    })
  })

  describe('State Machine Initialization', () => {
    it('should initialize with correct starting state', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')

      expect(machine.currentState).toBe('REGISTRATION_OPEN')
    })

    it('should accept any valid initial state', () => {
      const states: TournamentState[] = [
        'REGISTRATION_OPEN',
        'REGISTRATION_CLOSED',
        'GROUP_STAGE_ACTIVE',
        'GROUP_STAGE_COMPLETE',
        'KNOCKOUT_ACTIVE',
        'TOURNAMENT_COMPLETE'
      ]

      states.forEach(state => {
        const machine = new TournamentStateMachine(state)
        expect(machine.currentState).toBe(state)
      })
    })
  })

  describe('Transition Metadata', () => {
    it('should return transition details in success response', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const result = machine.transition('CLOSE_REGISTRATION')

      expect(result.success).toBe(true)
      expect(result.state).toBe('REGISTRATION_CLOSED')
      expect(result.previousState).toBe('REGISTRATION_OPEN')
    })

    it('should track state history', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')

      machine.transition('CLOSE_REGISTRATION')
      machine.transition('START_GROUP_STAGE', { playersRegistered: true })

      const history = machine.getStateHistory()

      expect(history).toContain('REGISTRATION_OPEN')
      expect(history).toContain('REGISTRATION_CLOSED')
      expect(history).toContain('GROUP_STAGE_ACTIVE')
    })
  })

  describe('Valid Transition Map', () => {
    it('should provide list of valid next transitions', () => {
      const machine = new TournamentStateMachine('REGISTRATION_OPEN')
      const validTransitions = machine.getValidTransitions()

      expect(validTransitions).toContain('CLOSE_REGISTRATION')
      expect(validTransitions).not.toContain('START_GROUP_STAGE')
      expect(validTransitions).not.toContain('START_KNOCKOUT')
    })

    it('should indicate valid transitions from each state', () => {
      const registrationClosed = new TournamentStateMachine('REGISTRATION_CLOSED')
      const validFromClosed = registrationClosed.getValidTransitions()

      expect(validFromClosed).toContain('START_GROUP_STAGE')

      const groupStageActive = new TournamentStateMachine('GROUP_STAGE_ACTIVE')
      const validFromGroup = groupStageActive.getValidTransitions()

      expect(validFromGroup).toContain('COMPLETE_GROUP_STAGE')
      expect(validFromGroup).not.toContain('START_GROUP_STAGE')
    })
  })
})
