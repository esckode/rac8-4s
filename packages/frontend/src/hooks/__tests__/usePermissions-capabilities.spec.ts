/**
 * usePermissions — capability flags for the dual-role model.
 *
 * Capabilities derive from two orthogonal axes (no combined role):
 *   canOrganize    = role is 'organizer' or 'admin'
 *   canParticipate = the account has a linked playerId
 * An organizer who also has a playerId can do both.
 */
import { renderHook } from '@testing-library/react'
import { usePermissions } from '../usePermissions'

jest.mock('../useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../useTournament', () => ({ useTournament: jest.fn() }))

import { useAuth } from '../useAuth'
import { useTournament } from '../useTournament'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUseTournament = useTournament as jest.MockedFunction<typeof useTournament>

function withUser(user: any) {
  mockUseAuth.mockReturnValue({ user, isAuthenticated: true, loading: false } as any)
  mockUseTournament.mockReturnValue({ tournament: null } as any)
}

describe('usePermissions capabilities (dual-role)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('organizer without a playerId: canOrganize, not canParticipate', () => {
    withUser({ id: 'a1', email: 'o@t.com', role: 'organizer' })
    const { result } = renderHook(() => usePermissions('t1'))
    expect(result.current.canOrganize).toBe(true)
    expect(result.current.canParticipate).toBe(false)
  })

  it('organizer WITH a playerId: canOrganize and canParticipate', () => {
    withUser({ id: 'a1', email: 'o@t.com', role: 'organizer', playerId: 'p1' })
    const { result } = renderHook(() => usePermissions('t1'))
    expect(result.current.canOrganize).toBe(true)
    expect(result.current.canParticipate).toBe(true)
  })

  it('player with a playerId: canParticipate, not canOrganize', () => {
    withUser({ id: 'a2', email: 'p@t.com', role: 'player', playerId: 'p2' })
    const { result } = renderHook(() => usePermissions('t1'))
    expect(result.current.canOrganize).toBe(false)
    expect(result.current.canParticipate).toBe(true)
  })

  it('admin: canOrganize', () => {
    withUser({ id: 'a3', email: 'admin@t.com', role: 'admin' })
    const { result } = renderHook(() => usePermissions('t1'))
    expect(result.current.canOrganize).toBe(true)
  })
})
