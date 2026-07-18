export type RequestClass = 'sse' | 'venue-read' | 'queueable-score' | 'navigation' | 'passthrough'

const SSE_PATH_RE = /^\/tournaments\/[^/]+\/events$/
const VENUE_READ_PATTERNS = [/^\/player\/tournaments$/, /^\/tournaments\/[^/]+\/bundle$/]
const QUEUEABLE_SCORE_RE = /^\/tournaments\/[^/]+\/(matches|knockout)\/[^/]+\/score$/

/**
 * Classify a request for the service worker's fetch handler. Evaluation order
 * matters: sse wins over everything (never intercepted, not even a queueable
 * score URL that happens to carry a token param), then queueable-score, then
 * venue-read, then navigation, then passthrough.
 *
 * Venue-read is exactly two endpoints (D2, amended 2026-07-18): GET
 * /player/tournaments and GET /tournaments/:id/bundle — the consolidation
 * endpoint the Matches/Standings/Bracket/Details tabs all actually consume.
 * The original per-view paths named in D2 (…/matches, …/groups/:gid/standings,
 * …/bracket) are dead code with zero production callers and deliberately
 * classify passthrough.
 */
export function classifyRequest(method: string, url: URL, mode: string): RequestClass {
  const path = url.pathname

  if (SSE_PATH_RE.test(path) || url.searchParams.has('token')) {
    return 'sse'
  }

  if ((method === 'POST' || method === 'PATCH') && QUEUEABLE_SCORE_RE.test(path)) {
    return 'queueable-score'
  }

  if (method === 'GET' && VENUE_READ_PATTERNS.some((pattern) => pattern.test(path))) {
    return 'venue-read'
  }

  if (mode === 'navigate') {
    return 'navigation'
  }

  return 'passthrough'
}
