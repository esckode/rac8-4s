/**
 * B4.1 [RED→GREEN] — useGroupMessages.send() sends the browser IANA timezone.
 *
 * FE side of the timezone-plumbing chain (design §11 B-Q6): send() attaches
 * Intl.DateTimeFormat().resolvedOptions().timeZone as an optional field so
 * @coach can resolve natural-language times the asker gives it.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { useGroupMessages, clearGroupMessageStores } from '../useGroupMessages'

const GROUP_ID = 'grp-send-test'

jest.mock('reconnecting-eventsource', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }))
})

describe('useGroupMessages send() timezone (B4.1)', () => {
  beforeEach(() => {
    clearGroupMessageStores()
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'm-1', conversationId: 'c-1', playerId: 'p-1', body: 'hi', type: 'text', createdAt: new Date().toISOString(), removedAt: null }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({ messages: [] }) } as Response)
    })
  })

  afterEach(() => { delete (global as any).fetch })

  it('includes the resolved IANA timezone in the send body', async () => {
    const { result } = renderHook(() => useGroupMessages(GROUP_ID))
    await waitFor(() => expect(result.current.messages).toEqual([]))

    await result.current.send('hello')

    const postCall = (global.fetch as jest.Mock).mock.calls.find(c => c[1]?.method === 'POST')
    expect(postCall).toBeDefined()
    const sentBody = JSON.parse(postCall![1].body)
    expect(sentBody.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})
