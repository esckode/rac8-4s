/**
 * ISSUE-6 — useBack(): true history-back for pushed auth screens, instead of
 * a hardcoded navigate(<literal>). react-router v6 sets location.key ===
 * 'default' on a cold first load (nothing pushed within the router) — in
 * that case there's nothing to pop, so fall back to the given parent route.
 */
import { renderHook } from '@testing-library/react'

const mockNavigate = jest.fn()
let mockLocationKey = 'abc123'

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ key: mockLocationKey, pathname: '/login', search: '', hash: '', state: null }),
}))

import { useBack } from '../useBack'

describe('useBack', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('navigates back (-1) when there is in-app history', () => {
    mockLocationKey = 'abc123'
    const { result } = renderHook(() => useBack('/'))
    result.current()
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('falls back to the given parent route on a cold first load (location.key === "default")', () => {
    mockLocationKey = 'default'
    const { result } = renderHook(() => useBack('/login'))
    result.current()
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('defaults the fallback to "/" when none is given', () => {
    mockLocationKey = 'default'
    const { result } = renderHook(() => useBack())
    result.current()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
