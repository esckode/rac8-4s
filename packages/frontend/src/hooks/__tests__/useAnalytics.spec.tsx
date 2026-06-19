import { renderHook, act } from '@testing-library/react'
import { useAnalytics } from '../useAnalytics'
import { useAuth } from '../useAuth'

jest.mock('../useAuth')

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('useAnalytics - locale capture', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({ user: { id: 'player_1' } } as any)
    Object.defineProperty(navigator, 'language', { value: 'pt-BR', configurable: true })
    ;(navigator as any).sendBeacon = jest.fn(() => true)
  })

  it('attaches the browser locale to flushed events', () => {
    const { result } = renderHook(() => useAnalytics())

    // Fill the buffer to MAX_BUFFER_SIZE (10) to trigger an auto-flush.
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.track('page_view', { screen: '/standings' })
      }
    })

    expect((navigator as any).sendBeacon).toHaveBeenCalledTimes(1)
    const body = (navigator as any).sendBeacon.mock.calls[0][1] as string
    const parsed = JSON.parse(body)
    expect(parsed.events).toHaveLength(10)
    expect(parsed.events[0].locale).toBe('pt-BR')
  })
})
