import {
  fetchAvailablePartners,
  fetchIncomingPartnerRequests,
  sendPartnerRequest,
  confirmPartner,
} from '../api/client'
import type { ApiError } from '../types'

// Polyfill Response for jsdom test environment (mirrors api-client.spec.ts)
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    body: string
    status: number
    headers: Map<string, string>
    ok: boolean

    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status || 200
      this.headers = new Map(Object.entries(init?.headers ?? {}))
      this.ok = this.status >= 200 && this.status < 300
    }

    json() {
      return Promise.resolve(JSON.parse(this.body))
    }

    text() {
      return Promise.resolve(this.body)
    }
  } as any
}

describe('API Client — partner requests', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })
  afterEach(() => {
    jest.clearAllMocks()
  })

  function lastCall() {
    return (global.fetch as jest.Mock).mock.calls[0]
  }

  describe('fetchAvailablePartners', () => {
    it('GETs /tournaments/:id/available-partners with the bearer token and returns players', async () => {
      const players = [{ id: 'p2', name: 'Bea' }]
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ players }), { status: 200 })
      )

      const result = await fetchAvailablePartners('t1', 'tok')

      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/available-partners')
      expect(options.method ?? 'GET').toBe('GET')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(result).toEqual(players)
    })
  })

  describe('fetchIncomingPartnerRequests', () => {
    it('GETs /tournaments/:id/partner-requests and returns requests', async () => {
      const requests = [{ registrationId: 'r1', requesterId: 'p1', requesterName: 'Ann' }]
      ;(global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ requests }), { status: 200 })
      )

      const result = await fetchIncomingPartnerRequests('t1', 'tok')

      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/partner-requests')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(result).toEqual(requests)
    })
  })

  describe('sendPartnerRequest', () => {
    it('POSTs /tournaments/:id/partner-requests with targetPlayerId and token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ registrationId: 'r1', targetPlayerId: 'p2', status: 'pending_partner_confirm' }), { status: 201 })
      )

      await sendPartnerRequest('t1', 'p2', 'tok')

      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/partner-requests')
      expect(options.method).toBe('POST')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(JSON.parse(options.body as string)).toEqual({ targetPlayerId: 'p2' })
    })

    it('throws an ApiError carrying the backend code on 409', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'INVALID_STATE', message: 'already paired' }), { status: 409 })
      )

      await expect(sendPartnerRequest('t1', 'p2', 'tok')).rejects.toMatchObject<Partial<ApiError>>({
        code: 'INVALID_STATE',
        status: 409,
      })
    })
  })

  describe('confirmPartner', () => {
    it('PATCHes /tournaments/registrations/:registrationId/confirm with the token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ registrationId: 'r1', status: 'registered', partnerConfirmed: true }), { status: 200 })
      )

      await confirmPartner('r1', 'tok')

      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/registrations/r1/confirm')
      expect(options.method).toBe('PATCH')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    })

    it('throws an ApiError carrying the backend code on 403', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'only partner' }), { status: 403 })
      )

      await expect(confirmPartner('r1', 'tok')).rejects.toMatchObject<Partial<ApiError>>({
        code: 'FORBIDDEN',
        status: 403,
      })
    })
  })
})
