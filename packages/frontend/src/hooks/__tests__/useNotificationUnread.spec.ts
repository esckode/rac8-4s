import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotificationUnread } from '../useNotificationUnread'
import { notificationUnreadStore } from '../../state/notification-unread-state'

let esListeners: Record<string, (event: unknown) => void> = {}
const closeMock = jest.fn()

jest.mock('reconnecting-eventsource', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn((event: string, cb: (event: unknown) => void) => {
      esListeners[event] = cb
    }),
    close: closeMock,
  }))
})

describe('useNotificationUnread', () => {
  beforeEach(() => {
    esListeners = {}
    closeMock.mockClear()
    localStorage.setItem('auth_token', 'test-tok')
    notificationUnreadStore.clear()
  })

  afterEach(() => {
    localStorage.clear()
    delete (global as any).fetch
  })

  it('seeds the count from GET /player/notifications/unread on mount', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 4 }),
    } as Response)

    const { result } = renderHook(() => useNotificationUnread())

    await waitFor(() => expect(result.current).toBe(4))
  })

  it('increments on a message.created SSE event', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 0 }),
    } as Response)

    const { result } = renderHook(() => useNotificationUnread())
    await waitFor(() => expect(result.current).toBe(0))

    act(() => {
      esListeners['message.created']?.({})
    })

    await waitFor(() => expect(result.current).toBe(1))
  })

  it('closes the SSE connection on unmount', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unread: 0 }),
    } as Response)

    const { unmount } = renderHook(() => useNotificationUnread())
    await waitFor(() => expect(closeMock).not.toHaveBeenCalled())
    unmount()
    expect(closeMock).toHaveBeenCalled()
  })

  it('does nothing without a stored token', () => {
    localStorage.clear()
    global.fetch = jest.fn()

    renderHook(() => useNotificationUnread())

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
