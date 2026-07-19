import { renderHook, act } from '@testing-library/react'
import { useAgeGate } from '../useAgeGate'

describe('useAgeGate', () => {
  it('starts in none phase', () => {
    const { result } = renderHook(() => useAgeGate())
    expect(result.current.ageGatePhase).toBe('none')
  })

  it('transitions to required on AGE_ATTESTATION_REQUIRED', () => {
    const { result } = renderHook(() => useAgeGate())
    act(() => result.current.handleAgeCode('AGE_ATTESTATION_REQUIRED'))
    expect(result.current.ageGatePhase).toBe('required')
  })

  it('transitions to underage on UNDER_AGE', () => {
    const { result } = renderHook(() => useAgeGate())
    act(() => result.current.handleAgeCode('UNDER_AGE'))
    expect(result.current.ageGatePhase).toBe('underage')
  })

  it('dismissAgeGate resets to none', () => {
    const { result } = renderHook(() => useAgeGate())
    act(() => result.current.handleAgeCode('AGE_ATTESTATION_REQUIRED'))
    act(() => result.current.dismissAgeGate())
    expect(result.current.ageGatePhase).toBe('none')
  })

  it('ignores unknown codes', () => {
    const { result } = renderHook(() => useAgeGate())
    act(() => result.current.handleAgeCode('SOME_OTHER_ERROR'))
    expect(result.current.ageGatePhase).toBe('none')
  })
})
