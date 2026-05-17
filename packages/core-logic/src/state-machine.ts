export type TournamentState =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'GROUP_STAGE_ACTIVE'
  | 'GROUP_STAGE_COMPLETE'
  | 'KNOCKOUT_ACTIVE'
  | 'TOURNAMENT_COMPLETE'

export type TransitionAction =
  | 'CLOSE_REGISTRATION'
  | 'OPEN_REGISTRATION'
  | 'START_GROUP_STAGE'
  | 'COMPLETE_GROUP_STAGE'
  | 'START_KNOCKOUT'
  | 'COMPLETE_TOURNAMENT'

interface TransitionGuards {
  playersRegistered?: boolean
  allScoresSubmitted?: boolean
  standingsCalculated?: boolean
  bracketGenerated?: boolean
  allKnockoutScoresSubmitted?: boolean
  forceAdvance?: boolean
}

interface TransitionResult {
  success: boolean
  state?: TournamentState
  previousState?: TournamentState
  error?: string
  message?: string
}

const VALID_TRANSITIONS: Record<TournamentState, TransitionAction[]> = {
  DRAFT: ['OPEN_REGISTRATION'],
  REGISTRATION_OPEN: ['CLOSE_REGISTRATION'],
  REGISTRATION_CLOSED: ['START_GROUP_STAGE'],
  GROUP_STAGE_ACTIVE: ['COMPLETE_GROUP_STAGE'],
  GROUP_STAGE_COMPLETE: ['START_KNOCKOUT'],
  KNOCKOUT_ACTIVE: ['COMPLETE_TOURNAMENT'],
  TOURNAMENT_COMPLETE: []
}

const GUARD_REQUIREMENTS: Record<TransitionAction, (guards?: TransitionGuards) => boolean> = {
  CLOSE_REGISTRATION: () => true,
  OPEN_REGISTRATION: () => true,
  START_GROUP_STAGE: (guards) => {
    if (guards?.forceAdvance) return true
    return guards?.playersRegistered ?? true
  },
  COMPLETE_GROUP_STAGE: (guards) => {
    if (guards?.forceAdvance) return true
    return guards?.allScoresSubmitted ?? true
  },
  START_KNOCKOUT: (guards) => {
    if (guards?.forceAdvance) return true
    return (guards?.standingsCalculated ?? true) && (guards?.bracketGenerated ?? true)
  },
  COMPLETE_TOURNAMENT: (guards) => {
    if (guards?.forceAdvance) return true
    return guards?.allKnockoutScoresSubmitted ?? true
  }
}

export class TournamentStateMachine {
  private state: TournamentState
  private history: TournamentState[] = []

  constructor(initialState: TournamentState) {
    this.state = initialState
    this.history = [initialState]
  }

  get currentState(): TournamentState {
    return this.state
  }

  transition(action: TransitionAction, guards?: TransitionGuards): TransitionResult {
    const validActions = VALID_TRANSITIONS[this.state]

    if (!validActions.includes(action)) {
      return {
        success: false,
        error: 'INVALID_TRANSITION',
        message: `Cannot transition from ${this.state} using action ${action}`
      }
    }

    if (!this.checkGuards(action, guards)) {
      return {
        success: false,
        error: 'GUARD_FAILED',
        message: `Guard conditions not met for transition ${action}`
      }
    }

    const previousState = this.state
    this.state = this.getNextState(action)
    this.history.push(this.state)

    return {
      success: true,
      state: this.state,
      previousState
    }
  }

  getStateHistory(): TournamentState[] {
    return [...this.history]
  }

  getValidTransitions(): TransitionAction[] {
    return VALID_TRANSITIONS[this.state]
  }

  private checkGuards(action: TransitionAction, guards?: TransitionGuards): boolean {
    const guardCheck = GUARD_REQUIREMENTS[action]
    return guardCheck(guards)
  }

  private getNextState(action: TransitionAction): TournamentState {
    switch (action) {
      case 'CLOSE_REGISTRATION':
        return 'REGISTRATION_CLOSED'
      case 'OPEN_REGISTRATION':
        return 'REGISTRATION_OPEN'
      case 'START_GROUP_STAGE':
        return 'GROUP_STAGE_ACTIVE'
      case 'COMPLETE_GROUP_STAGE':
        return 'GROUP_STAGE_COMPLETE'
      case 'START_KNOCKOUT':
        return 'KNOCKOUT_ACTIVE'
      case 'COMPLETE_TOURNAMENT':
        return 'TOURNAMENT_COMPLETE'
      default:
        return this.state
    }
  }
}
