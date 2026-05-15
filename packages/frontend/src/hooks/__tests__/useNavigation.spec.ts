import { renderHook, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import { useNavigation } from '../useNavigation'

const renderWithRouter = (callback: () => any) => {
  return renderHook(callback, {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(BrowserRouter, {}, children),
  })
}

describe('useNavigation', () => {
  it('returns navigation functions', () => {
    const { result } = renderWithRouter(() => useNavigation())

    expect(result.current.navigate).toBeDefined()
    expect(result.current.isActive).toBeDefined()
    expect(result.current.currentTab).toBeDefined()
  })

  it('detects current tab from URL', () => {
    window.history.pushState({}, 'Test', '/standings')
    const { result } = renderWithRouter(() => useNavigation())

    expect(result.current.currentTab).toBe('standings')
  })

  it('isActive returns true for current tab', () => {
    window.history.pushState({}, 'Test', '/matches')
    const { result } = renderWithRouter(() => useNavigation())

    expect(result.current.isActive('matches')).toBe(true)
    expect(result.current.isActive('standings')).toBe(false)
  })

  it('isActive returns false for non-current tabs', () => {
    window.history.pushState({}, 'Test', '/bracket')
    const { result } = renderWithRouter(() => useNavigation())

    expect(result.current.isActive('bracket')).toBe(true)
    expect(result.current.isActive('more')).toBe(false)
  })

  it('handles null currentTab for unknown routes', () => {
    window.history.pushState({}, 'Test', '/unknown')
    const { result } = renderWithRouter(() => useNavigation())

    expect(result.current.currentTab).toBeNull()
  })
})
