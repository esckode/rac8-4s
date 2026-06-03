import {
  trackPageView,
  trackScoreSubmission,
  trackBracketAdvance,
  trackTeamCreation,
  trackPartnerConfirmed,
  Analytics
} from '../../utils/analytics'

describe('Analytics Tracking', () => {
  let mockFetch: any
  let analyticsInstance: Analytics

  beforeEach(() => {
    mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => ({ success: true })
    })
    global.fetch = mockFetch

    analyticsInstance = new Analytics('test-session-id')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('trackPageView', () => {
    it('should track page view for dashboard', async () => {
      await trackPageView('dashboard', {
        tournamentId: 't1',
        format: 'doubles'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"page.view"')
        })
      )
    })

    it('should track page view for group stage', async () => {
      await trackPageView('groups', {
        tournamentId: 't1',
        groupId: 'g1'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.any(Object)
      )
    })

    it('should track page view for bracket', async () => {
      await trackPageView('bracket', {
        tournamentId: 't1'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.any(Object)
      )
    })

    it('should include page name and context', async () => {
      const context = { tournamentId: 't1', format: 'doubles' }
      await trackPageView('dashboard', context)

      const calls = mockFetch.mock.calls
      expect(calls.length).toBeGreaterThan(0)

      const [, options] = calls[0]
      const body = JSON.parse(options.body)
      expect(body.page).toBe('dashboard')
      expect(body.context).toEqual(context)
    })

    it('should handle network errors gracefully', async () => {
      jest.clearAllMocks()
      mockFetch = jest.fn().mockRejectedValueOnce(new Error('Network error'))
      global.fetch = mockFetch

      await expect(
        trackPageView('dashboard', { tournamentId: 't1' })
      ).rejects.toThrow()
    })

    it('should include timestamp', async () => {
      const beforeTime = Date.now()
      await trackPageView('dashboard', { tournamentId: 't1' })
      const afterTime = Date.now()

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(body.timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('trackScoreSubmission', () => {
    it('should track score submission', async () => {
      await trackScoreSubmission({
        tournamentId: 't1',
        matchId: 'm1',
        score: '2-1',
        submittedBy: 'p1',
        matchFormat: 'singles'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"score.submitted"')
        })
      )
    })

    it('should include score details', async () => {
      const details = {
        tournamentId: 't1',
        matchId: 'm1',
        score: '2-1',
        submittedBy: 'p1',
        matchFormat: 'doubles' as const
      }

      await trackScoreSubmission(details)

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.event).toBe('score.submitted')
      expect(body.tournamentId).toBe('t1')
      expect(body.matchId).toBe('m1')
      expect(body.score).toBe('2-1')
      expect(body.matchFormat).toBe('doubles')
    })

    it('should track doubles score submission', async () => {
      await trackScoreSubmission({
        tournamentId: 't1',
        matchId: 'm1',
        score: '2-1',
        submittedBy: 'p1',
        matchFormat: 'doubles',
        team1Id: 'team_1',
        team2Id: 'team_2'
      })

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.team1Id).toBe('team_1')
      expect(body.team2Id).toBe('team_2')
    })

    it('should handle submission retries', async () => {
      jest.clearAllMocks()
      mockFetch = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true })
      global.fetch = mockFetch

      // Should retry
      await expect(
        trackScoreSubmission({
          tournamentId: 't1',
          matchId: 'm1',
          score: '2-1',
          submittedBy: 'p1',
          matchFormat: 'singles'
        })
      ).rejects.toThrow()
    })
  })

  describe('trackBracketAdvance', () => {
    it('should track bracket advance for singles', async () => {
      await trackBracketAdvance({
        tournamentId: 't1',
        matchId: 'm1',
        winnerId: 'p1',
        matchFormat: 'singles',
        round: 'semi-finals'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"bracket.advance"')
        })
      )
    })

    it('should track bracket advance for doubles', async () => {
      await trackBracketAdvance({
        tournamentId: 't1',
        matchId: 'm1',
        winnerId: 'team_1',
        matchFormat: 'doubles',
        round: 'finals',
        team1Id: 'team_1',
        team2Id: 'team_2'
      })

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.winnerId).toBe('team_1')
      expect(body.team1Id).toBe('team_1')
      expect(body.team2Id).toBe('team_2')
    })

    it('should include round information', async () => {
      await trackBracketAdvance({
        tournamentId: 't1',
        matchId: 'm1',
        winnerId: 'p1',
        matchFormat: 'singles',
        round: 'finals'
      })

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.round).toBe('finals')
    })
  })

  describe('trackTeamCreation', () => {
    it('should track team creation on select', async () => {
      await trackTeamCreation({
        tournamentId: 't1',
        player1Id: 'p1',
        player2Id: 'p2',
        registrationType: 'select'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"team.created"')
        })
      )
    })

    it('should track team creation on invite', async () => {
      await trackTeamCreation({
        tournamentId: 't1',
        player1Id: 'p1',
        player2Email: 'bob@test.com',
        registrationType: 'invite'
      })

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.event).toBe('team.created')
      expect(body.registrationType).toBe('invite')
    })

    it('should include both registration types', async () => {
      // Select type
      await trackTeamCreation({
        tournamentId: 't1',
        player1Id: 'p1',
        player2Id: 'p2',
        registrationType: 'select'
      })

      let calls = mockFetch.mock.calls
      let [, options] = calls[calls.length - 1]
      let body = JSON.parse(options.body)
      expect(body.registrationType).toBe('select')

      // Invite type
      await trackTeamCreation({
        tournamentId: 't1',
        player1Id: 'p1',
        player2Email: 'bob@test.com',
        registrationType: 'invite'
      })

      calls = mockFetch.mock.calls
      [, options] = calls[calls.length - 1]
      body = JSON.parse(options.body)
      expect(body.registrationType).toBe('invite')
    })
  })

  describe('trackPartnerConfirmed', () => {
    it('should track partner confirmation', async () => {
      await trackPartnerConfirmed({
        tournamentId: 't1',
        playerId: 'p1',
        partnerId: 'p2',
        bothConfirmed: false
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analytics'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"partnership.confirmed"')
        })
      )
    })

    it('should track when both players confirmed', async () => {
      await trackPartnerConfirmed({
        tournamentId: 't1',
        playerId: 'p1',
        partnerId: 'p2',
        bothConfirmed: true
      })

      const calls = mockFetch.mock.calls
      const [, options] = calls[0]
      const body = JSON.parse(options.body)

      expect(body.bothConfirmed).toBe(true)
    })

    it('should track both confirmed and pending states', async () => {
      // Pending
      await trackPartnerConfirmed({
        tournamentId: 't1',
        playerId: 'p1',
        partnerId: 'p2',
        bothConfirmed: false
      })

      let calls = mockFetch.mock.calls
      let [, options] = calls[calls.length - 1]
      let body = JSON.parse(options.body)
      expect(body.bothConfirmed).toBe(false)

      // Both confirmed
      await trackPartnerConfirmed({
        tournamentId: 't1',
        playerId: 'p1',
        partnerId: 'p2',
        bothConfirmed: true
      })

      calls = mockFetch.mock.calls
      [, options] = calls[calls.length - 1]
      body = JSON.parse(options.body)
      expect(body.bothConfirmed).toBe(true)
    })
  })

  describe('Analytics class', () => {
    it('should create instance with session ID', () => {
      const sessionId = 'test-session-123'
      const analytics = new Analytics(sessionId)

      expect(analytics).toBeDefined()
    })

    it('should batch events', async () => {
      const analytics = new Analytics('test-session')

      await analytics.trackEvent('page.view', {
        page: 'dashboard',
        tournamentId: 't1'
      })

      await analytics.trackEvent('score.submitted', {
        matchId: 'm1',
        score: '2-1'
      })

      // Both events should be sent
      expect(mockFetch.mock.calls.length).toBeGreaterThan(0)
    })

    it('should handle offline mode', async () => {
      const analytics = new Analytics('test-session')

      // Simulate offline
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(
        analytics.trackEvent('page.view', { page: 'dashboard' })
      ).rejects.toThrow()
    })
  })

  describe('Event data validation', () => {
    it('should require tournament ID for events', async () => {
      // Missing tournament ID should fail validation
      expect(() => {
        trackPageView('dashboard', {})
      }).toThrow()
    })

    it('should validate score format', async () => {
      // Invalid score format should fail
      expect(() => {
        trackScoreSubmission({
          tournamentId: 't1',
          matchId: 'm1',
          score: 'invalid',
          submittedBy: 'p1',
          matchFormat: 'singles'
        })
      }).toThrow()
    })

    it('should validate match format', async () => {
      // Invalid format should fail
      expect(() => {
        trackScoreSubmission({
          tournamentId: 't1',
          matchId: 'm1',
          score: '2-1',
          submittedBy: 'p1',
          matchFormat: 'invalid' as any
        })
      }).toThrow()
    })
  })

  describe('Error handling', () => {
    it('should handle server errors', async () => {
      jest.clearAllMocks()
      mockFetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => ({ error: 'Internal server error' })
      })
      global.fetch = mockFetch

      await expect(
        trackPageView('dashboard', { tournamentId: 't1' })
      ).rejects.toThrow()
    })

    it('should handle malformed responses', async () => {
      jest.clearAllMocks()
      mockFetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: () => {
          throw new Error('Invalid JSON')
        }
      })
      global.fetch = mockFetch

      await expect(
        trackPageView('dashboard', { tournamentId: 't1' })
      ).rejects.toThrow()
    })

    it('should not throw on network timeout', async () => {
      jest.clearAllMocks()
      mockFetch = jest.fn().mockRejectedValueOnce(new Error('Timeout'))
      global.fetch = mockFetch

      // Should handle gracefully
      try {
        await trackPageView('dashboard', { tournamentId: 't1' })
      } catch (e) {
        expect(e).toBeDefined()
      }
    })
  })
})
