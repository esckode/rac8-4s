import type { MatchWithOpponent } from '../types'

export class MatchStore {
  private matches: MatchWithOpponent[] = []

  setMatches(matches: MatchWithOpponent[]): void {
    this.matches = [...matches]
  }

  all(): MatchWithOpponent[] {
    return [...this.matches]
  }

  filterUpcoming(): MatchWithOpponent[] {
    return this.matches.filter(m => m.status === 'pending')
  }

  filterCompleted(): MatchWithOpponent[] {
    return this.matches.filter(m => m.status === 'completed')
  }

  filterByType(type: 'group' | 'knockout'): MatchWithOpponent[] {
    return this.matches.filter(m => m.type === type)
  }

  filterByRound(round: number): MatchWithOpponent[] {
    return this.matches.filter(m => m.round === round)
  }

  clear(): void {
    this.matches = []
  }
}
