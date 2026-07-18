import {
  advanceTournament,
  createGroups,
  generateBracket,
  publishBracket,
} from '../api/client'
import type { ApiError } from '../types'

// Polyfill Response for jsdom (mirrors api-client.spec.ts)
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

describe('API Client — organizer lifecycle', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })
  afterEach(() => {
    jest.clearAllMocks()
  })
  const lastCall = () => (global.fetch as jest.Mock).mock.calls[0]

  describe('advanceTournament', () => {
    it('POSTs /tournaments/:id/advance with the action and bearer token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ status: 'registration_closed', previousStatus: 'registration_open', message: 'ok' }), { status: 200 })
      )

      const res = await advanceTournament('t1', 'CLOSE_REGISTRATION', 'tok')

      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/advance')
      expect(options.method).toBe('POST')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(JSON.parse(options.body as string)).toEqual({ action: 'CLOSE_REGISTRATION' })
      expect(res.status).toBe('registration_closed')
    })

    it('includes forceAdvance when passed', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ status: 'group_stage_complete', previousStatus: 'group_stage_active', message: 'ok' }), { status: 200 })
      )

      await advanceTournament('t1', 'COMPLETE_GROUP_STAGE', 'tok', true)

      const [, options] = lastCall()
      expect(JSON.parse(options.body as string)).toEqual({ action: 'COMPLETE_GROUP_STAGE', forceAdvance: true })
    })

    it('throws an ApiError carrying the backend code on 409 GUARD_FAILED', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'GUARD_FAILED', message: 'guard' }), { status: 409 })
      )

      await expect(advanceTournament('t1', 'COMPLETE_GROUP_STAGE', 'tok')).rejects.toMatchObject<Partial<ApiError>>({
        code: 'GUARD_FAILED',
        status: 409,
      })
    })
  })

  describe('createGroups', () => {
    it('POSTs /tournaments/:id/groups with the body and token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ groups: [{ id: 'g1', name: 'A', playerCount: 2, advancingCount: 1 }] }), { status: 201 })
      )

      const res = await createGroups('t1', { numGroups: 1, advancingPerGroup: 1, pairUnpaired: false }, 'tok')

      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/groups')
      expect(options.method).toBe('POST')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      expect(JSON.parse(options.body as string)).toEqual({ numGroups: 1, advancingPerGroup: 1, pairUnpaired: false })
      expect(res.groups).toHaveLength(1)
    })

    it('surfaces 409 INVALID_STATE', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ code: 'INVALID_STATE', message: 'bad state' }), { status: 409 })
      )
      await expect(createGroups('t1', { numGroups: 1, advancingPerGroup: 1 }, 'tok')).rejects.toMatchObject({
        code: 'INVALID_STATE',
      })
    })
  })

  describe('generateBracket / publishBracket', () => {
    it('generateBracket POSTs /tournaments/:id/bracket/generate with the token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ bracket: {} }), { status: 200 }))
      await generateBracket('t1', 'tok')
      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/bracket/generate')
      expect(options.method).toBe('POST')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    })

    it('publishBracket POSTs /tournaments/:id/bracket/publish with the token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ matches: [] }), { status: 200 }))
      await publishBracket('t1', 'tok')
      const [url, options] = lastCall()
      expect(url).toContain('/tournaments/t1/bracket/publish')
      expect(options.method).toBe('POST')
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    })
  })
})
