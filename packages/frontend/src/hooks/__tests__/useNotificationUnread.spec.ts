/**
 * useNotificationUnread — fetch-on-mount + refocus (matches usePendingActions;
 * see the hook's own comment for why this isn't SSE-backed).
 */
import { renderHook, waitFor } from '@testing-library/react'
import { useNotificationUnread } from '../useNotificationUnread'
import { notificationUnreadStore } from '../../state/notification-unread-state'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('useNotificationUnread', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    notificationUnreadStore.clear()
  })

  it('does nothing without a stored token', () => {
    renderHook(() => useNotificationUnread())
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('seeds the count from GET /player/notifications/unread on mount', async () => {
    localStorage.setItem('auth_token', 'test-tok')
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 4 }) })

    const { result } = renderHook(() => useNotificationUnread())

    await waitFor(() => expect(result.current).toBe(4))
    expect(mockFetch).toHaveBeenCalledWith(
      '/player/notifications/unread',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-tok' } })
    )
  })

  it('refetches on window focus', async () => {
    localStorage.setItem('auth_token', 'test-tok')
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 0 }) })
    const { result } = renderHook(() => useNotificationUnread())
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 2 }) })
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(result.current).toBe(2))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
