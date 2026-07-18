import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { Signout } from '../Signout'
import { useAuth } from '../../hooks/useAuth'
import * as swBridge from '../../pwa/sw-bridge'

jest.mock('../../hooks/useAuth')
jest.mock('../../pwa/sw-bridge')

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockWipePlayerData = swBridge.wipePlayerData as jest.MockedFunction<typeof swBridge.wipePlayerData>

describe('Signout', () => {
  const callOrder: string[] = []

  beforeEach(() => {
    jest.clearAllMocks()
    callOrder.length = 0
    mockWipePlayerData.mockImplementation(async () => {
      callOrder.push('wipePlayerData')
    })
    mockNavigate.mockImplementation(() => {
      callOrder.push('navigate')
    })
  })

  it('wipes offline venue data before logging out and navigating home (D5)', async () => {
    const logout = jest.fn().mockImplementation(async () => {
      callOrder.push('logout')
    })
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
      login: jest.fn(),
      signup: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      logout,
    })

    render(<Signout />)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))

    expect(callOrder).toEqual(['wipePlayerData', 'logout', 'navigate'])
  })

  it('still navigates home if logout() throws (wipe already happened)', async () => {
    const logout = jest.fn().mockRejectedValue(new Error('logout failed'))
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
      login: jest.fn(),
      signup: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      logout,
    })

    render(<Signout />)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))

    expect(callOrder).toEqual(['wipePlayerData', 'navigate'])
  })
})
