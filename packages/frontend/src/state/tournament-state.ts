import type { Tournament } from '@shared/types'
import { tournamentPhaseLabel, type TournamentPhase } from '../types'

type Subscriber = (tournament: Tournament | undefined) => void

export class TournamentStore {
  private tournament_: Tournament | undefined
  private subscribers: Set<Subscriber> = new Set()

  get tournament(): Tournament | undefined {
    return this.tournament_
  }

  get currentPhase(): string {
    if (!this.tournament_) return 'Unknown'
    return tournamentPhaseLabel[this.tournament_.status as TournamentPhase] || 'Unknown'
  }

  get isRegistrationOpen(): boolean {
    return this.tournament_?.status === 'registration_open'
  }

  get isGroupStageActive(): boolean {
    return this.tournament_?.status === 'group_stage_active'
  }

  get isKnockoutActive(): boolean {
    return this.tournament_?.status === 'knockout_active'
  }

  get isComplete(): boolean {
    return this.tournament_?.status === 'tournament_complete'
  }

  set(tournament: Tournament): void {
    this.tournament_ = tournament
    this.notifySubscribers()
  }

  clear(): void {
    this.tournament_ = undefined
    this.notifySubscribers()
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.tournament_))
  }
}
