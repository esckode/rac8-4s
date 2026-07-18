import { classifyRequest } from '../routing'

describe('classifyRequest', () => {
  describe('venue-read', () => {
    it.each([
      ['GET', '/player/tournaments'],
      ['GET', '/tournaments/abc-123/bundle'],
    ])('%s %s classifies venue-read', (method, path) => {
      expect(classifyRequest(method, new URL(`https://example.com${path}`), 'same-origin')).toBe(
        'venue-read'
      )
    })

    it.each([
      ['/tournaments/x/bundle/y'],
      ['/tournaments/public'],
      ['/player/tournaments/x'],
      ['/player/tournament'],
    ])('near-miss %s does not classify venue-read', (path) => {
      expect(
        classifyRequest('GET', new URL(`https://example.com${path}`), 'same-origin')
      ).not.toBe('venue-read')
    })

    it('non-GET on a venue-read path does not classify venue-read', () => {
      expect(
        classifyRequest('POST', new URL('https://example.com/player/tournaments'), 'same-origin')
      ).not.toBe('venue-read')
    })

    it.each([
      ['/tournaments/abc-123/matches'],
      ['/tournaments/abc-123/groups/grp-1/standings'],
      ['/tournaments/abc-123/bracket'],
    ])(
      'dead per-view path %s classifies passthrough (D2 amendment — zero production callers)',
      (path) => {
        expect(
          classifyRequest('GET', new URL(`https://example.com${path}`), 'same-origin')
        ).toBe('passthrough')
      }
    )
  })

  describe('sse', () => {
    it('classifies the events stream path as sse', () => {
      expect(
        classifyRequest('GET', new URL('https://example.com/tournaments/abc-123/events'), 'same-origin')
      ).toBe('sse')
    })

    it('classifies any URL carrying a token query param as sse, regardless of path', () => {
      expect(
        classifyRequest(
          'GET',
          new URL('https://example.com/player/tournaments?token=abc.def.ghi'),
          'same-origin'
        )
      ).toBe('sse')
    })

    it('wins over venue-read even when the path would otherwise match', () => {
      expect(
        classifyRequest(
          'GET',
          new URL('https://example.com/tournaments/abc-123/bundle?token=xyz'),
          'same-origin'
        )
      ).toBe('sse')
    })

    it('wins over queueable-score even when the path would otherwise match', () => {
      expect(
        classifyRequest(
          'POST',
          new URL('https://example.com/tournaments/abc-123/matches/m1/score?token=xyz'),
          'same-origin'
        )
      ).toBe('sse')
    })
  })

  describe('queueable-score', () => {
    it.each([
      ['POST', '/tournaments/abc-123/matches/m1/score'],
      ['PATCH', '/tournaments/abc-123/matches/m1/score'],
      ['POST', '/tournaments/abc-123/knockout/k1/score'],
      ['PATCH', '/tournaments/abc-123/knockout/k1/score'],
    ])('%s %s classifies queueable-score', (method, path) => {
      expect(classifyRequest(method, new URL(`https://example.com${path}`), 'same-origin')).toBe(
        'queueable-score'
      )
    })

    it.each([
      ['GET', '/tournaments/abc-123/matches/m1/score'],
      ['DELETE', '/tournaments/abc-123/matches/m1/score'],
    ])('%s %s does not classify queueable-score', (method, path) => {
      expect(
        classifyRequest(method, new URL(`https://example.com${path}`), 'same-origin')
      ).not.toBe('queueable-score')
    })
  })

  describe('passthrough — other writes and API paths', () => {
    it.each([
      ['POST', '/tournaments/abc-123/advance'],
      ['POST', '/tournaments/abc-123/partner-requests'],
      ['POST', '/api/billing/charge'],
    ])('%s %s classifies passthrough', (method, path) => {
      expect(classifyRequest(method, new URL(`https://example.com${path}`), 'same-origin')).toBe(
        'passthrough'
      )
    })
  })

  describe('navigation', () => {
    it('classifies a navigate-mode request as navigation', () => {
      expect(classifyRequest('GET', new URL('https://example.com/matches'), 'navigate')).toBe(
        'navigation'
      )
    })

    it('non-navigate mode on the same URL does not classify navigation', () => {
      expect(classifyRequest('GET', new URL('https://example.com/matches'), 'same-origin')).not.toBe(
        'navigation'
      )
    })
  })

  describe('precedence order', () => {
    it('sse beats navigation when both could apply', () => {
      expect(
        classifyRequest('GET', new URL('https://example.com/tournaments/x/events'), 'navigate')
      ).toBe('sse')
    })

    it('queueable-score beats venue-read/navigation when the path only matches score', () => {
      expect(
        classifyRequest(
          'POST',
          new URL('https://example.com/tournaments/abc-123/matches/m1/score'),
          'navigate'
        )
      ).toBe('queueable-score')
    })

    it('venue-read beats navigation when a GET venue path is (implausibly) marked navigate', () => {
      expect(
        classifyRequest('GET', new URL('https://example.com/player/tournaments'), 'navigate')
      ).toBe('venue-read')
    })
  })
})
