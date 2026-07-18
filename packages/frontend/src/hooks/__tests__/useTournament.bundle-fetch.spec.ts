/**
 * fetchTournamentBundle — the raw fetch behind useTournament's queryFn.
 * Bypasses api/client's apiFetch entirely (Bearer token in the Authorization
 * header, not the URL), so the D4 offline-snapshot header sniff is tested
 * directly here rather than through the heavily-mocked useTournament.spec.ts.
 */
import { fetchTournamentBundle } from '../useTournament'
import * as OfflineSnapshot from '../../pwa/OfflineSnapshotContext'

jest.mock('../../pwa/OfflineSnapshotContext', () => ({
  notifyOfflineSnapshot: jest.fn(),
  clearOfflineSnapshot: jest.fn(),
}))

function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    statusText: 'OK',
    headers: new Map(Object.entries(init.headers ?? {})),
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('fetchTournamentBundle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('calls notifyOfflineSnapshot with the cached-at header when sw-cache: fallback is present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse(
        { tournament: null, standings: [], matches: { group: [], knockout: [] }, bracket: null },
        { headers: { 'sw-cache': 'fallback', 'sw-cached-at': '2026-07-18T10:30:00.000Z' } }
      )
    )

    await fetchTournamentBundle('t1', 'token_abc')

    expect(OfflineSnapshot.notifyOfflineSnapshot).toHaveBeenCalledWith(
      '/tournaments/t1/bundle',
      '2026-07-18T10:30:00.000Z'
    )
    expect(OfflineSnapshot.clearOfflineSnapshot).not.toHaveBeenCalled()
  })

  it('calls clearOfflineSnapshot on a normal (non-fallback) response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockResponse({ tournament: null, standings: [], matches: { group: [], knockout: [] }, bracket: null })
    )

    await fetchTournamentBundle('t1', 'token_abc')

    expect(OfflineSnapshot.clearOfflineSnapshot).toHaveBeenCalledWith('/tournaments/t1/bundle')
    expect(OfflineSnapshot.notifyOfflineSnapshot).not.toHaveBeenCalled()
  })
})
