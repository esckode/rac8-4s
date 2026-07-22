/**
 * ISSUE-5 — fake iOS status bar (hardcoded "9:41" + fake signal/wifi/battery)
 * shipped on the real auth pages, copy-pasted out of the design-mockup files.
 * Asserts none of Login/Signup/ForgotPassword/ResetPassword render it, in
 * every render branch (ForgotPassword/ResetPassword each have a form state
 * and a success/confirmation state).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Login } from '../../pages/Login'
import { Signup } from '../../pages/Signup'
import { ForgotPassword } from '../../pages/ForgotPassword'
import { ResetPassword } from '../../pages/ResetPassword'

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: jest.fn(), signup: jest.fn() }),
}))

const mockFetch = jest.fn()
global.fetch = mockFetch as any

function renderAt(path: string, element: React.ReactElement, fallbackPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path={fallbackPath} element={<div>fallback</div>} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ISSUE-5 — no fake status bar on real auth pages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Login renders no fake status bar', () => {
    renderAt('/login', <Login />)
    expect(screen.queryByText('9:41')).not.toBeInTheDocument()
  })

  it('Signup renders no fake status bar', () => {
    renderAt('/signup', <Signup />)
    expect(screen.queryByText('9:41')).not.toBeInTheDocument()
  })

  it('ForgotPassword form state renders no fake status bar', () => {
    renderAt('/forgot-password', <ForgotPassword />)
    expect(screen.queryByText('9:41')).not.toBeInTheDocument()
  })

  it('ForgotPassword success state renders no fake status bar', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    renderAt('/forgot-password', <ForgotPassword />)

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }))

    await waitFor(() => expect(screen.getByText(/code sent/i)).toBeInTheDocument())
    expect(screen.queryByText('9:41')).not.toBeInTheDocument()
  })

  it('ResetPassword form state renders no fake status bar', () => {
    renderAt('/reset-password', <ResetPassword />)
    expect(screen.queryByText('9:41')).not.toBeInTheDocument()
  })

  it('ResetPassword success state renders no fake status bar', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    renderAt('/reset-password', <ResetPassword />)

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/reset code/i), { target: { value: '123456' } })
    fireEvent.change(screen.getByPlaceholderText(/enter a new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/confirm your password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(screen.getByText(/password updated\./i)).toBeInTheDocument())
    expect(screen.queryByText('9:41')).not.toBeInTheDocument()
  })
})
