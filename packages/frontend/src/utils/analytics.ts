/**
 * Analytics tracking utilities for RAC8-4S tournament platform.
 * Tracks events for both singles and doubles tournaments.
 */

const API_ENDPOINT = '/api/analytics'

export interface PageViewContext {
  [key: string]: string | boolean | number
}

export interface ScoreSubmissionEvent {
  tournamentId: string
  matchId: string
  score: string
  submittedBy: string
  matchFormat: 'singles' | 'doubles'
  team1Id?: string
  team2Id?: string
  groupId?: string
}

export interface BracketAdvanceEvent {
  tournamentId: string
  matchId: string
  winnerId: string
  matchFormat: 'singles' | 'doubles'
  round: string
  team1Id?: string
  team2Id?: string
}

export interface TeamCreationEvent {
  tournamentId: string
  player1Id: string
  player2Id?: string
  player2Email?: string
  registrationType: 'select' | 'invite'
}

export interface PartnerConfirmationEvent {
  tournamentId: string
  playerId: string
  partnerId: string
  bothConfirmed: boolean
}

export class Analytics {
  private sessionId: string
  private queue: any[] = []

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async trackEvent(event: string, data: any): Promise<void> {
    const payload = {
      event,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      ...data
    }

    this.queue.push(payload)

    // Send immediately
    await this.send(payload)
  }

  private async send(payload: any): Promise<void> {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Analytics failed: ${response.status}`)
      }

      return await response.json()
    } catch (err) {
      // Log but don't throw - analytics failures shouldn't break the app
      console.error('Analytics error:', err)
      throw err
    }
  }
}

/**
 * Validate score format (e.g., "2-1")
 */
function validateScore(score: string): boolean {
  const match = /^\d+-\d+$/.test(score)
  if (!match) return false

  const [s1, s2] = score.split('-').map(Number)
  return s1 >= 0 && s2 >= 0 && (s1 > 0 || s2 > 0)
}

/**
 * Track page view event.
 */
export async function trackPageView(
  page: 'dashboard' | 'groups' | 'bracket' | string,
  context: PageViewContext
): Promise<void> {
  if (!context.tournamentId) {
    throw new Error('Tournament ID required for page view tracking')
  }

  const analytics = new Analytics(getSessionId())
  await analytics.trackEvent('page.view', {
    page,
    context,
    timestamp: Date.now()
  })
}

/**
 * Track score submission event.
 */
export async function trackScoreSubmission(event: ScoreSubmissionEvent): Promise<void> {
  if (!event.tournamentId || !event.matchId) {
    throw new Error('Tournament and match IDs required for score submission tracking')
  }

  if (!validateScore(event.score)) {
    throw new Error('Invalid score format')
  }

  if (!['singles', 'doubles'].includes(event.matchFormat)) {
    throw new Error('Invalid match format')
  }

  const analytics = new Analytics(getSessionId())
  await analytics.trackEvent('score.submitted', {
    tournamentId: event.tournamentId,
    matchId: event.matchId,
    score: event.score,
    submittedBy: event.submittedBy,
    matchFormat: event.matchFormat,
    team1Id: event.team1Id,
    team2Id: event.team2Id,
    groupId: event.groupId
  })
}

/**
 * Track bracket advancement event.
 */
export async function trackBracketAdvance(event: BracketAdvanceEvent): Promise<void> {
  if (!event.tournamentId || !event.matchId) {
    throw new Error('Tournament and match IDs required for bracket advance tracking')
  }

  if (!['singles', 'doubles'].includes(event.matchFormat)) {
    throw new Error('Invalid match format')
  }

  const analytics = new Analytics(getSessionId())
  await analytics.trackEvent('bracket.advance', {
    tournamentId: event.tournamentId,
    matchId: event.matchId,
    winnerId: event.winnerId,
    matchFormat: event.matchFormat,
    round: event.round,
    team1Id: event.team1Id,
    team2Id: event.team2Id
  })
}

/**
 * Track team creation event.
 */
export async function trackTeamCreation(event: TeamCreationEvent): Promise<void> {
  if (!event.tournamentId || !event.player1Id) {
    throw new Error('Tournament and player IDs required for team creation tracking')
  }

  if (!['select', 'invite'].includes(event.registrationType)) {
    throw new Error('Invalid registration type')
  }

  const analytics = new Analytics(getSessionId())
  await analytics.trackEvent('team.created', {
    tournamentId: event.tournamentId,
    player1Id: event.player1Id,
    player2Id: event.player2Id,
    player2Email: event.player2Email,
    registrationType: event.registrationType
  })
}

/**
 * Track partner confirmation event.
 */
export async function trackPartnerConfirmed(event: PartnerConfirmationEvent): Promise<void> {
  if (!event.tournamentId || !event.playerId || !event.partnerId) {
    throw new Error('Tournament, player, and partner IDs required for confirmation tracking')
  }

  const analytics = new Analytics(getSessionId())
  await analytics.trackEvent('partnership.confirmed', {
    tournamentId: event.tournamentId,
    playerId: event.playerId,
    partnerId: event.partnerId,
    bothConfirmed: event.bothConfirmed
  })
}

/**
 * Get or create session ID from localStorage.
 */
function getSessionId(): string {
  const key = 'rac8_session_id'
  let sessionId = localStorage.getItem(key)

  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(key, sessionId)
  }

  return sessionId
}
