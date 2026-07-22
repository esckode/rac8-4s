/**
 * ISSUE-6 — auth "back" chevrons hardcoded navigate(<literal>) instead of
 * true history-back. Verifies the wired-up chevrons on Login, Signup,
 * ForgotPassword (form state), and ResetPassword (both success + form
 * state) call navigate(-1) when there's in-app history, and fall back to
 * the logical parent on a cold first load.
 *
 * ForgotPassword's success-state chevron is NOT covered here: it resets
 * local component state (back to the editable form), not a router
 * navigation — out of scope for this fix.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Login } from '../../pages/Login'
import { Signup } from '../../pages/Signup'
import { ForgotPassword } from '../../pages/ForgotPassword'
import { ResetPassword } from '../../pages/ResetPassword'

const mockNavigate = jest.fn()
let mockLocationKey = 'abc123'

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

jest.mock('../../hooks/useBack', () => {
  const actual = jest.requireActual('../../hooks/useBack')
  return {
    useBack: (fallback?: string) => {
      return () => {
        if (mockLocationKey !== 'default') {
          mockNavigate(-1)
        } else {
          mockNavigate(fallback ?? '/')
        }
      }
    },
  }
})

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: jest.fn(), signup: jest.fn() }),
}))

const mockFetch = jest.fn()
global.fetch = mockFetch as any

function renderAt(path: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ISSUE-6 — auth back buttons use true history-back', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLocationKey = 'abc123'
  })

  it('Login back button calls navigate(-1) when there is history', () => {
    renderAt('/login', <Login />)
    fireEvent.click(screen.getByTestId('back-button'))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('Login back button falls back to "/" on a cold first load', () => {
    mockLocationKey = 'default'
    renderAt('/login', <Login />)
    fireEvent.click(screen.getByTestId('back-button'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('Signup back button calls navigate(-1) when there is history', () => {
    renderAt('/signup', <Signup />)
    fireEvent.click(screen.getByTestId('back-button'))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('ForgotPassword form-state back button calls navigate(-1) when there is history', () => {
    renderAt('/forgot-password', <ForgotPassword />)
    fireEvent.click(screen.getByTestId('back-button'))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('ResetPassword form-state back button calls navigate(-1) when there is history', () => {
    renderAt('/reset-password', <ResetPassword />)
    fireEvent.click(screen.getByTestId('back-button'))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('ResetPassword success-state back button falls back to "/login" on a cold first load', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    mockLocationKey = 'default'
    renderAt('/reset-password', <ResetPassword />)

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/reset code/i), { target: { value: '123456' } })
    fireEvent.change(screen.getByPlaceholderText(/enter a new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(screen.getByText(/password updated\./i)).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('back-button'))
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})
