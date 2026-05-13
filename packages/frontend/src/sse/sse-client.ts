import type { SSEHandlers, StandingsUpdatedPayload, BracketPublishedPayload } from '../types'

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000'

export class SSEClient {
  private eventSource: EventSource | null = null
  private handlers: SSEHandlers | null = null
  private callbacks: {
    standings?: (event: MessageEvent) => void
    bracket?: (event: MessageEvent) => void
    error?: (event: Event) => void
  } = {}

  connect(
    tournamentId: string,
    token: string,
    handlers: SSEHandlers
  ): void {
    // Close existing connection if any
    if (this.eventSource) {
      this.disconnect()
    }

    this.handlers = handlers

    // Construct URL with token as query parameter (since EventSource doesn't support custom headers)
    const url = new URL(`${API_BASE}/tournaments/${tournamentId}/events`)
    url.searchParams.set('token', token)

    this.eventSource = new EventSource(url.toString())

    // Store callback references for later removal
    const standingsCallback = (event: MessageEvent) => {
      try {
        const payload: StandingsUpdatedPayload = JSON.parse(event.data)
        handlers.onStandingsUpdated(payload)
      } catch (error) {
        handlers.onError({
          code: 'PARSE_ERROR',
          message: 'Failed to parse standings.updated event',
          status: 500,
        })
      }
    }

    const bracketCallback = (event: MessageEvent) => {
      try {
        const payload: BracketPublishedPayload = JSON.parse(event.data)
        handlers.onBracketPublished(payload)
      } catch (error) {
        handlers.onError({
          code: 'PARSE_ERROR',
          message: 'Failed to parse bracket.published event',
          status: 500,
        })
      }
    }

    const errorCallback = () => {
      if (this.eventSource && this.eventSource.readyState !== 2) {
        // ReadyState 2 = CLOSED
        handlers.onReconnect()
      }
    }

    // Register event handlers
    this.eventSource.addEventListener('standings.updated', standingsCallback)
    this.eventSource.addEventListener('bracket.published', bracketCallback)
    this.eventSource.addEventListener('error', errorCallback)

    // Store callbacks for later removal
    this.callbacks.standings = standingsCallback
    this.callbacks.bracket = bracketCallback
    this.callbacks.error = errorCallback
  }

  disconnect(): void {
    if (this.eventSource) {
      // Remove event listeners before closing
      if (this.callbacks.standings) {
        this.eventSource.removeEventListener('standings.updated', this.callbacks.standings)
      }
      if (this.callbacks.bracket) {
        this.eventSource.removeEventListener('bracket.published', this.callbacks.bracket)
      }
      if (this.callbacks.error) {
        this.eventSource.removeEventListener('error', this.callbacks.error)
      }

      this.eventSource.close()
      this.eventSource = null
      this.handlers = null
      this.callbacks = {}
    }
  }
}
